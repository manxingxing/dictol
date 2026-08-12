use std::path::{Path, PathBuf};

use crate::model::{Entry, FileKind, Key, MddKey, Metadata, Version};
use crate::options::OpenOptions;
use crate::scanner::{Entries, Keys, Prefix};
use crate::{Error, Mdict, Result};

/// Binary-resource entry point for one physical MDD file.
#[derive(Debug)]
pub struct Mdd {
    inner: Mdict,
    version: Version,
}

impl Mdd {
    /// 使用默认配置打开一份物理 MDD 文件。
    pub fn open(path: impl AsRef<Path>) -> Result<Self> {
        Self::open_with_options(path, OpenOptions::default())
    }

    /// 使用调用方配置打开并验证一份物理 MDD 文件。
    pub fn open_with_options(path: impl AsRef<Path>, options: OpenOptions) -> Result<Self> {
        let inner = Mdict::open_with_options(path, options)?;
        Self::from_mdict(inner)
    }

    /// 将已经打开的基础读取器提升为 MDD 资源入口。
    pub fn from_mdict(inner: Mdict) -> Result<Self> {
        if inner.kind() != FileKind::Mdd {
            return Err(Error::invalid(
                inner.path(),
                4,
                "expected an MDD resource dictionary",
            ));
        }
        let version = inner.metadata().version;
        Ok(Self { inner, version })
    }

    /// 返回负责基础二进制读取的 `Mdict`。
    pub fn as_mdict(&self) -> &Mdict {
        &self.inner
    }

    /// 返回物理 MDD 文件路径。
    pub fn path(&self) -> &Path {
        self.inner.path()
    }

    /// 返回该物理 MDD 文件的元数据。
    pub fn metadata(&self) -> &Metadata {
        self.inner.metadata()
    }

    /// 返回 Header 中的原始加密标记。
    pub fn encryption_flags(&self) -> u8 {
        self.inner.encryption_flags()
    }

    /// 返回该文件解压后的 record 地址空间大小。
    pub fn record_size(&self) -> u64 {
        self.inner.record_size()
    }

    /// 按文件原始顺序遍历全部资源 key。
    pub fn keys(&self) -> Keys<'_> {
        self.inner.keys()
    }

    /// 按文件原始顺序遍历全部资源及其原始数据。
    pub fn entries(&self) -> Entries<'_> {
        self.inner.entries()
    }

    /// 返回第一个精确匹配的资源位置。
    pub fn find_key(&self, key: &str) -> Result<Option<Key>> {
        self.inner.find_key(&self.normalize_key(key))
    }

    /// 返回该文件中全部重复资源位置。
    pub fn find_keys(&self, key: &str) -> Result<Vec<Key>> {
        self.inner.find_keys(&self.normalize_key(key))
    }

    /// 创建该文件的流式前缀查询。
    pub fn prefix(&self, prefix: &str) -> Result<Prefix<'_>> {
        self.inner.prefix(&self.normalize_key(prefix))
    }

    /// 从该文件读取一个逻辑 record 范围。
    pub fn read_record(&self, start: u64, end: u64) -> Result<Vec<u8>> {
        self.inner.read_record(start, end)
    }

    /// 查找并返回一个二进制资源。
    pub fn lookup(&self, key: &str) -> Result<Option<Entry>> {
        let Some(found) = self.find_key(key)? else {
            return Ok(None);
        };
        Ok(Some(Entry {
            key: found.text,
            data: self.read_record(found.record_start, found.record_end)?,
        }))
    }

    /// 按当前 MDD 版本统一资源路径分隔符。
    fn normalize_key(&self, key: &str) -> String {
        if self.version == Version::V3 {
            key.to_owned()
        } else {
            key.replace('/', "\\")
        }
    }
}

/// An explicitly ordered list of physical MDD files.
#[derive(Debug)]
pub struct MddList {
    volumes: Vec<Mdd>,
}

impl MddList {
    /// 使用默认配置打开调用方提供的 MDD 文件列表。
    pub fn open(paths: Vec<impl AsRef<Path>>) -> Result<Self> {
        Self::open_with_options(paths, OpenOptions::default())
    }

    /// 使用调用方配置打开并验证同版本 MDD 文件列表。
    ///
    /// `paths` 的顺序就是资源查询优先级；库不会扫描目录或自动补充分卷。
    pub fn open_with_options(paths: Vec<impl AsRef<Path>>, options: OpenOptions) -> Result<Self> {
        let paths: Vec<PathBuf> = paths
            .into_iter()
            .map(|path| path.as_ref().to_path_buf())
            .collect();
        if paths.is_empty() {
            return Err(Error::invalid(
                Path::new("<MDD list>"),
                0,
                "no MDD files supplied",
            ));
        }
        if paths.len() as u64 > options.limits.maximum_mdd_volume_count {
            return Err(Error::LimitExceeded {
                name: "MDD file count",
                actual: paths.len() as u64,
                maximum: options.limits.maximum_mdd_volume_count,
            });
        }

        let mut volumes = Vec::with_capacity(paths.len());
        for path in paths {
            volumes.push(Mdd::open_with_options(path, options.clone())?);
        }
        let version = volumes
            .first()
            .expect("non-empty MDD paths validated above")
            .metadata()
            .version;
        for volume in &volumes[1..] {
            if volume.metadata().version != version {
                return Err(Error::invalid(
                    volume.path(),
                    4,
                    "MDD file version differs from the first file",
                ));
            }
        }
        Ok(Self { volumes })
    }

    /// 返回列表中的物理 MDD 文件数量。
    pub fn volume_count(&self) -> usize {
        self.volumes.len()
    }

    /// 返回指定下标对应的物理 MDD 文件。
    pub fn volume(&self, index: usize) -> Option<&Mdd> {
        self.volumes.get(index)
    }

    /// 按文件顺序遍历全部资源 key。
    pub fn keys(&self) -> MddListKeys<'_> {
        MddListKeys {
            dictionary: self,
            volume: 0,
            current: None,
        }
    }

    /// 创建跨全部文件的批量 key 扫描器。
    pub fn key_scanner(&self) -> MddListKeyScanner {
        MddListKeyScanner::new()
    }

    /// 创建跨全部文件的批量 entry 扫描器。
    pub fn entry_scanner(&self) -> MddListEntryScanner {
        MddListEntryScanner::new()
    }

    /// 按文件顺序遍历全部资源及其原始数据。
    pub fn entries(&self) -> MddListEntries<'_> {
        MddListEntries {
            dictionary: self,
            volume: 0,
            current: None,
        }
    }

    /// 按文件优先级返回第一个精确匹配的资源位置。
    pub fn find_key(&self, key: &str) -> Result<Option<MddKey>> {
        for (volume, dictionary) in self.volumes.iter().enumerate() {
            if let Some(found) = dictionary.find_key(key)? {
                return Ok(Some(to_mdd_key(volume, found)?));
            }
        }
        Ok(None)
    }

    /// 返回列表中全部重复资源位置。
    pub fn find_keys(&self, key: &str) -> Result<Vec<MddKey>> {
        let mut output = Vec::new();
        for (volume, dictionary) in self.volumes.iter().enumerate() {
            for found in dictionary.find_keys(key)? {
                output.push(to_mdd_key(volume, found)?);
            }
        }
        Ok(output)
    }

    /// 创建跨全部文件的流式前缀查询。
    pub fn prefix(&self, prefix: &str) -> Result<MddListPrefix<'_>> {
        Ok(MddListPrefix {
            dictionary: self,
            prefix: prefix.to_owned(),
            volume: 0,
            current: None,
        })
    }

    /// 从指定文件读取一个逻辑 record 范围。
    pub fn read_record(&self, volume: u32, start: u64, end: u64) -> Result<Vec<u8>> {
        self.volumes
            .get(volume as usize)
            .ok_or_else(|| {
                Error::invalid(
                    Path::new("<MDD list>"),
                    0,
                    format!("MDD file {volume} is out of range"),
                )
            })?
            .read_record(start, end)
    }

    /// 按文件优先级查找并返回第一个二进制资源。
    pub fn lookup(&self, key: &str) -> Result<Option<Entry>> {
        let Some(found) = self.find_key(key)? else {
            return Ok(None);
        };
        Ok(Some(Entry {
            key: found.text,
            data: self.read_record(found.volume, found.record_start, found.record_end)?,
        }))
    }
}

/// Stateful batch scanner over all keys in an [`MddList`].
pub struct MddListKeyScanner {
    volume: usize,
    scanner: Option<crate::scanner::KeyScanner>,
    finished: bool,
}

impl MddListKeyScanner {
    /// 创建从第一个文件开始的扫描器。
    pub fn new() -> Self {
        Self {
            volume: 0,
            scanner: None,
            finished: false,
        }
    }

    /// 读取下一批带文件编号的 key。
    pub fn next_batch(&mut self, dictionary: &MddList, limit: usize) -> Result<Vec<MddKey>> {
        if limit == 0 {
            return Err(Error::invalid(
                Path::new("<MDD list>"),
                0,
                "MDD list key scanner batch size must be greater than zero",
            ));
        }
        let mut output = Vec::with_capacity(limit);
        while output.len() < limit && !self.finished {
            let Some(volume) = dictionary.volumes.get(self.volume) else {
                self.finished = true;
                break;
            };
            let scanner = self
                .scanner
                .get_or_insert_with(crate::scanner::KeyScanner::new);
            match scanner.next_key(volume.as_mdict())? {
                Some(key) => output.push(to_mdd_key(self.volume, key)?),
                None => {
                    self.volume += 1;
                    self.scanner = None;
                }
            }
        }
        Ok(output)
    }

    /// 返回是否已耗尽列表中的全部文件。
    pub fn is_finished(&self) -> bool {
        self.finished
    }
}

impl Default for MddListKeyScanner {
    fn default() -> Self {
        Self::new()
    }
}

/// Stateful batch scanner over all entries in an [`MddList`].
pub struct MddListEntryScanner {
    keys: MddListKeyScanner,
}

impl MddListEntryScanner {
    /// 创建从第一个文件开始的 entry 扫描器。
    pub fn new() -> Self {
        Self {
            keys: MddListKeyScanner::new(),
        }
    }

    /// 读取下一批资源 entry。
    pub fn next_batch(&mut self, dictionary: &MddList, limit: usize) -> Result<Vec<Entry>> {
        let keys = self.keys.next_batch(dictionary, limit)?;
        keys.into_iter()
            .map(|key| {
                Ok(Entry {
                    key: key.text,
                    data: dictionary.read_record(key.volume, key.record_start, key.record_end)?,
                })
            })
            .collect()
    }

    /// 返回是否已耗尽列表中的全部文件。
    pub fn is_finished(&self) -> bool {
        self.keys.is_finished()
    }
}

impl Default for MddListEntryScanner {
    fn default() -> Self {
        Self::new()
    }
}

/// 给单文件 `Key` 添加 MDD 文件编号。
fn to_mdd_key(volume: usize, key: Key) -> Result<MddKey> {
    Ok(MddKey {
        volume: u32::try_from(volume).map_err(|_| Error::LimitExceeded {
            name: "MDD file count",
            actual: volume as u64,
            maximum: u64::from(u32::MAX),
        })?,
        text: key.text,
        record_start: key.record_start,
        record_end: key.record_end,
    })
}

/// Iterator over all keys in an [`MddList`], file by file.
pub struct MddListKeys<'a> {
    dictionary: &'a MddList,
    volume: usize,
    current: Option<Keys<'a>>,
}

impl Iterator for MddListKeys<'_> {
    type Item = Result<MddKey>;

    /// 产出当前文件的 key；耗尽后自动切换到下一个文件。
    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.current.is_none() {
                let volume = self.dictionary.volumes.get(self.volume)?;
                self.current = Some(volume.keys());
            }
            match self.current.as_mut().unwrap().next() {
                Some(Ok(key)) => return Some(to_mdd_key(self.volume, key)),
                Some(Err(error)) => {
                    self.volume = self.dictionary.volumes.len();
                    self.current = None;
                    return Some(Err(error));
                }
                None => {
                    self.volume += 1;
                    self.current = None;
                }
            }
        }
    }
}

/// Iterator over all raw entries in an [`MddList`], file by file.
pub struct MddListEntries<'a> {
    dictionary: &'a MddList,
    volume: usize,
    current: Option<Entries<'a>>,
}

impl Iterator for MddListEntries<'_> {
    type Item = Result<Entry>;

    /// 产出当前文件的 entry；耗尽后自动切换到下一个文件。
    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.current.is_none() {
                let volume = self.dictionary.volumes.get(self.volume)?;
                self.current = Some(volume.entries());
            }
            match self.current.as_mut().unwrap().next() {
                Some(Ok(entry)) => return Some(Ok(entry)),
                Some(Err(error)) => {
                    self.volume = self.dictionary.volumes.len();
                    self.current = None;
                    return Some(Err(error));
                }
                None => {
                    self.volume += 1;
                    self.current = None;
                }
            }
        }
    }
}

/// Iterator over prefix matches in every file of an [`MddList`].
pub struct MddListPrefix<'a> {
    dictionary: &'a MddList,
    prefix: String,
    volume: usize,
    current: Option<Prefix<'a>>,
}

impl Iterator for MddListPrefix<'_> {
    type Item = Result<MddKey>;

    /// 产出当前文件的前缀结果；耗尽后自动切换到下一个文件。
    fn next(&mut self) -> Option<Self::Item> {
        loop {
            if self.current.is_none() {
                let volume = self.dictionary.volumes.get(self.volume)?;
                match volume.prefix(&self.prefix) {
                    Ok(prefix) => self.current = Some(prefix),
                    Err(error) => {
                        self.volume = self.dictionary.volumes.len();
                        return Some(Err(error));
                    }
                }
            }
            match self.current.as_mut().unwrap().next() {
                Some(Ok(key)) => return Some(to_mdd_key(self.volume, key)),
                Some(Err(error)) => {
                    self.volume = self.dictionary.volumes.len();
                    self.current = None;
                    return Some(Err(error));
                }
                None => {
                    self.volume += 1;
                    self.current = None;
                }
            }
        }
    }
}
