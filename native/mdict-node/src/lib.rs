use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use dictol_mdict::{Entry, EntryCursor, FileKind, MdictFile, MdictLimits, RecordLocation};
use napi::bindgen_prelude::{AsyncTask, BigInt, Buffer, Either, Null};
use napi::{Env, Error, Result, Status, Task};
use napi_derive::napi;

const DEFAULT_BATCH_SIZE: u32 = 2_048;
const MAXIMUM_BATCH_SIZE: u32 = 100_000;

#[napi(object, object_from_js = false)]
pub struct DictionaryMetadata {
    pub path: String,
    pub kind: String,
    pub engine_version: f64,
    pub required_version: Option<f64>,
    pub encoding: String,
    pub encrypted: u32,
    pub title: String,
    pub description: String,
    pub format: String,
    pub key_case_sensitive: bool,
    pub strip_key: bool,
    pub attributes: HashMap<String, String>,
    pub warnings: Vec<String>,
    pub raw_header_xml: String,
    pub entry_count: u64,
    pub key_block_count: u64,
    pub record_block_count: u64,
    pub total_decompressed_record_size: u64,
}

#[napi(object, object_to_js = false)]
pub struct OpenOptions {
    pub maximum_header_size_bytes: Option<u32>,
    pub maximum_index_compressed_size_bytes: Option<u32>,
    pub maximum_index_decompressed_size_bytes: Option<u32>,
    pub maximum_block_compressed_size_bytes: Option<u32>,
    pub maximum_block_decompressed_size_bytes: Option<u32>,
    pub maximum_key_text_size_bytes: Option<u32>,
    pub maximum_record_size_bytes: Option<u32>,
    pub maximum_block_count: Option<u32>,
}

#[napi(object, object_from_js = false)]
pub struct DictionaryEntry {
    pub key_text: String,
    pub key_block: u32,
    pub record_start: u64,
    pub record_end: u64,
    pub first_record_block: u32,
}

#[napi(object, object_from_js = false)]
pub struct EntryBatch {
    pub entries: Vec<DictionaryEntry>,
    pub done: bool,
}

#[napi(object, object_from_js = false)]
pub struct DictionaryLookup {
    pub key_text: String,
    pub definition: Either<String, Null>,
}

#[napi]
pub struct MdictDictionary {
    dictionary: Arc<MdictFile>,
}

#[napi]
impl MdictDictionary {
    #[napi(factory)]
    pub fn open(path: String, options: Option<OpenOptions>) -> Result<Self> {
        let limits = apply_options(MdictLimits::default(), options);
        let dictionary = MdictFile::open_with_limits(path, limits).map_err(to_napi_error)?;
        Ok(Self {
            dictionary: Arc::new(dictionary),
        })
    }

    #[napi(getter)]
    pub fn metadata(&self) -> DictionaryMetadata {
        let header = self.dictionary.header();
        DictionaryMetadata {
            path: self.dictionary.path().to_string_lossy().into_owned(),
            kind: match self.dictionary.kind() {
                FileKind::Mdx => "mdx",
                FileKind::Mdd => "mdd",
            }
            .to_string(),
            engine_version: f64::from(header.engine_version),
            required_version: header.required_version.map(f64::from),
            encoding: header.encoding.clone(),
            encrypted: u32::from(header.encrypted),
            title: header.title.clone(),
            description: header.description.clone(),
            format: header.format.clone(),
            key_case_sensitive: header.key_case_sensitive,
            strip_key: header.strip_key,
            attributes: header
                .attributes
                .iter()
                .map(|(key, value)| (key.clone(), value.clone()))
                .collect(),
            warnings: header.warnings.clone(),
            raw_header_xml: header.raw_xml.clone(),
            entry_count: self.dictionary.key_section().entry_count,
            key_block_count: self.dictionary.key_section().block_count,
            record_block_count: self.dictionary.record_section().block_count,
            total_decompressed_record_size: self
                .dictionary
                .record_section()
                .total_decompressed_size,
        }
    }

    #[napi(ts_return_type = "MdictEntryScanner")]
    pub fn create_scanner(&self) -> MdictEntryScanner {
        MdictEntryScanner {
            state: Arc::new(ScannerState {
                dictionary: Arc::clone(&self.dictionary),
                cursor: Mutex::new(self.dictionary.entry_cursor()),
                busy: AtomicBool::new(false),
            }),
        }
    }

    #[napi(ts_return_type = "Promise<Buffer>")]
    pub fn read_record(&self, start: BigInt, end: BigInt) -> Result<AsyncTask<ReadRecordTask>> {
        Ok(AsyncTask::new(ReadRecordTask {
            dictionary: Arc::clone(&self.dictionary),
            start: bigint_to_u64(start, "start")?,
            end: bigint_to_u64(end, "end")?,
        }))
    }

    #[napi(ts_return_type = "Promise<DictionaryEntry | null>")]
    pub fn lookup_key_block_by_word(&self, word: String) -> AsyncTask<LookupKeyBlockTask> {
        AsyncTask::new(LookupKeyBlockTask {
            dictionary: Arc::clone(&self.dictionary),
            word,
        })
    }

    #[napi(ts_return_type = "Promise<DictionaryLookup>")]
    pub fn lookup(&self, word: String) -> Result<AsyncTask<LookupTask>> {
        if self.dictionary.kind() != FileKind::Mdx {
            return Err(Error::new(
                Status::InvalidArg,
                "lookup is only available for MDX files; use lookupKeyBlockByWord and readRecord for MDD resources"
                    .to_string(),
            ));
        }
        Ok(AsyncTask::new(LookupTask {
            dictionary: Arc::clone(&self.dictionary),
            word,
        }))
    }
}

struct ScannerState {
    dictionary: Arc<MdictFile>,
    cursor: Mutex<EntryCursor>,
    busy: AtomicBool,
}

#[napi]
pub struct MdictEntryScanner {
    state: Arc<ScannerState>,
}

#[napi]
impl MdictEntryScanner {
    #[napi(ts_return_type = "Promise<EntryBatch>")]
    pub fn next_batch(&self, batch_size: Option<u32>) -> Result<AsyncTask<NextBatchTask>> {
        let batch_size = batch_size.unwrap_or(DEFAULT_BATCH_SIZE);
        if batch_size == 0 || batch_size > MAXIMUM_BATCH_SIZE {
            return Err(Error::new(
                Status::InvalidArg,
                format!("batchSize must be between 1 and {MAXIMUM_BATCH_SIZE}"),
            ));
        }
        if self
            .state
            .busy
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .is_err()
        {
            return Err(Error::new(
                Status::GenericFailure,
                "nextBatch is already running for this scanner".to_string(),
            ));
        }

        Ok(AsyncTask::new(NextBatchTask {
            state: Arc::clone(&self.state),
            batch_size: batch_size as usize,
        }))
    }
}

pub struct NextBatchTask {
    state: Arc<ScannerState>,
    batch_size: usize,
}

impl Drop for NextBatchTask {
    fn drop(&mut self) {
        self.state.busy.store(false, Ordering::Release);
    }
}

impl Task for NextBatchTask {
    type Output = EntryBatch;
    type JsValue = EntryBatch;

    fn compute(&mut self) -> Result<Self::Output> {
        let result = (|| {
            let mut cursor = self
                .state
                .cursor
                .lock()
                .map_err(|_| Error::from_reason("entry scanner lock is poisoned"))?;
            let entries = cursor
                .next_batch(&self.state.dictionary, self.batch_size)
                .map_err(to_napi_error)?;
            let done = cursor.is_finished();
            Ok(EntryBatch {
                entries: entries.into_iter().map(DictionaryEntry::from).collect(),
                done,
            })
        })();
        self.state.busy.store(false, Ordering::Release);
        result
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

pub struct ReadRecordTask {
    dictionary: Arc<MdictFile>,
    start: u64,
    end: u64,
}

impl Task for ReadRecordTask {
    type Output = Vec<u8>;
    type JsValue = Buffer;

    fn compute(&mut self) -> Result<Self::Output> {
        self.dictionary
            .read_record(&RecordLocation {
                start: self.start,
                end: self.end,
                first_record_block: 0,
            })
            .map_err(to_napi_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output.into())
    }
}

pub struct LookupKeyBlockTask {
    dictionary: Arc<MdictFile>,
    word: String,
}

impl Task for LookupKeyBlockTask {
    type Output = Option<Entry>;
    type JsValue = Option<DictionaryEntry>;

    fn compute(&mut self) -> Result<Self::Output> {
        self.dictionary
            .lookup_key_block_by_word(&self.word)
            .map_err(to_napi_error)
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output.map(DictionaryEntry::from))
    }
}

pub struct LookupTask {
    dictionary: Arc<MdictFile>,
    word: String,
}

impl Task for LookupTask {
    type Output = DictionaryLookup;
    type JsValue = DictionaryLookup;

    fn compute(&mut self) -> Result<Self::Output> {
        let definition = self
            .dictionary
            .lookup(&self.word)
            .map_err(to_napi_error)?
            .map(|result| self.dictionary.decode_record(&result.record))
            .map_or(Either::B(Null), Either::A);
        Ok(DictionaryLookup {
            key_text: self.word.clone(),
            definition,
        })
    }

    fn resolve(&mut self, _env: Env, output: Self::Output) -> Result<Self::JsValue> {
        Ok(output)
    }
}

impl From<Entry> for DictionaryEntry {
    fn from(entry: Entry) -> Self {
        Self {
            key_text: entry.key_text,
            key_block: entry.key_block,
            record_start: entry.location.start,
            record_end: entry.location.end,
            first_record_block: entry.location.first_record_block,
        }
    }
}

fn apply_options(mut limits: MdictLimits, options: Option<OpenOptions>) -> MdictLimits {
    let Some(options) = options else {
        return limits;
    };
    assign_u32(
        &mut limits.maximum_header_size,
        options.maximum_header_size_bytes,
    );
    assign_u32(
        &mut limits.maximum_index_compressed_size,
        options.maximum_index_compressed_size_bytes,
    );
    assign_u32(
        &mut limits.maximum_index_decompressed_size,
        options.maximum_index_decompressed_size_bytes,
    );
    assign_u32(
        &mut limits.maximum_block_compressed_size,
        options.maximum_block_compressed_size_bytes,
    );
    assign_u32(
        &mut limits.maximum_block_decompressed_size,
        options.maximum_block_decompressed_size_bytes,
    );
    assign_u32(
        &mut limits.maximum_key_text_size,
        options.maximum_key_text_size_bytes,
    );
    assign_u32(
        &mut limits.maximum_record_size,
        options.maximum_record_size_bytes,
    );
    assign_u32(&mut limits.maximum_block_count, options.maximum_block_count);
    limits
}

fn assign_u32(target: &mut u64, value: Option<u32>) {
    if let Some(value) = value {
        *target = u64::from(value);
    }
}

fn bigint_to_u64(value: BigInt, label: &str) -> Result<u64> {
    let (negative, value, lossless) = value.get_u64();
    if negative || !lossless {
        Err(Error::new(
            Status::InvalidArg,
            format!("{label} must be a non-negative bigint within the u64 range"),
        ))
    } else {
        Ok(value)
    }
}

fn to_napi_error(error: dictol_mdict::Error) -> Error {
    Error::from_reason(error.to_string())
}
