use std::io::{self, BufWriter, Write};
use std::path::{Path, PathBuf};

use clap::{ArgAction, ArgGroup, Parser};
use dictol_mdict_next::{FileKind, Mdict};

/// 读取和检查 MDX/MDD 词典。
#[derive(Debug, Parser)]
#[command(
    name = "mdict",
    version,
    about = "Inspect MDX dictionaries and extract MDD resources",
    disable_help_flag = true,
    group(
        ArgGroup::new("operation")
            .required(true)
            .args(["header", "keys", "key", "prefix", "lookup", "extract"])
    )
)]
struct Cli {
    /// 打印词典 Header XML。
    #[arg(short = 'h', long = "header", value_name = "FILE")]
    header: Option<PathBuf>,

    /// 列出所有 key 及其 record 范围。
    #[arg(short = 'K', long = "keys", value_name = "FILE")]
    keys: Option<PathBuf>,

    /// 查询单个 key，并输出 key、record 起始和结束偏移：-k KEY FILE。
    #[arg(
        short = 'k',
        long = "key",
        value_names = ["KEY", "FILE"],
        num_args = 2
    )]
    key: Option<Vec<String>>,

    /// 查询所有以指定前缀开头的 key：-p PREFIX FILE。
    #[arg(
        short = 'p',
        long = "prefix",
        value_names = ["PREFIX", "FILE"],
        num_args = 2
    )]
    prefix: Option<Vec<String>>,

    /// 查找 MDX 词条并输出 UTF-8 文本：-l KEY FILE。
    #[arg(
        short = 'l',
        long = "lookup",
        value_names = ["KEY", "FILE"],
        num_args = 2
    )]
    lookup: Option<Vec<String>>,

    /// 提取 MDD 二进制资源并写入 stdout：-x KEY FILE。
    #[arg(
        short = 'x',
        long = "extract",
        value_names = ["KEY", "FILE"],
        num_args = 2
    )]
    extract: Option<Vec<String>>,

    /// 打印帮助信息。
    #[arg(long = "help", action = ArgAction::Help)]
    help: Option<bool>,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("error: {error}");
        std::process::exit(1);
    }
}

fn run() -> Result<(), Box<dyn std::error::Error>> {
    let cli = Cli::parse();

    if let Some(path) = cli.header {
        let dictionary = Mdict::open(path)?;
        print_header(dictionary.header().raw_xml.as_str())?;
    } else if let Some(path) = cli.keys {
        let dictionary = Mdict::open(path)?;
        list_keys(&dictionary)?;
    } else if let Some(values) = cli.key {
        let (key, path) = parse_key_and_path(values)?;
        let dictionary = Mdict::open(path)?;
        print_key_location(&dictionary, &key)?;
    } else if let Some(values) = cli.prefix {
        let (prefix, path) = parse_key_and_path(values)?;
        let dictionary = Mdict::open(path)?;
        list_prefix(&dictionary, &prefix)?;
    } else if let Some(values) = cli.lookup {
        let (key, path) = parse_key_and_path(values)?;
        let dictionary = Mdict::open(path)?;
        lookup_text(&dictionary, &key)?;
    } else if let Some(values) = cli.extract {
        let (key, path) = parse_key_and_path(values)?;
        let dictionary = Mdict::open(path)?;
        extract_resource(&dictionary, &key)?;
    }

    Ok(())
}

fn print_header(header: &str) -> io::Result<()> {
    let mut stdout = io::BufWriter::new(io::stdout().lock());
    stdout.write_all(header.as_bytes())?;
    if !header.ends_with('\n') {
        stdout.write_all(b"\n")?;
    }
    stdout.flush()
}

fn list_keys(dictionary: &Mdict) -> Result<(), Box<dyn std::error::Error>> {
    let stdout = io::stdout();
    let mut output = BufWriter::new(stdout.lock());
    for entry in dictionary.keys() {
        let entry = entry?;
        writeln!(
            output,
            "{}\t{}\t{}",
            entry.key, entry.record_start, entry.record_end
        )?;
    }
    output.flush()?;
    Ok(())
}

fn print_key_location(dictionary: &Mdict, key: &str) -> Result<(), Box<dyn std::error::Error>> {
    let Some(entry) = dictionary.find_key(key)? else {
        return Err(format!("key not found: {key}").into());
    };
    println!(
        "{}\t{}\t{}",
        entry.key, entry.record_start, entry.record_end
    );
    Ok(())
}

fn list_prefix(dictionary: &Mdict, prefix: &str) -> Result<(), Box<dyn std::error::Error>> {
    let stdout = io::stdout();
    let mut output = BufWriter::new(stdout.lock());
    for entry in dictionary.prefix(prefix)? {
        writeln!(output, "{}", entry.key)?;
    }
    output.flush()?;
    Ok(())
}

fn lookup_text(dictionary: &Mdict, key: &str) -> Result<(), Box<dyn std::error::Error>> {
    if dictionary.kind() != FileKind::Mdx {
        return Err("-l/--lookup requires an .mdx dictionary".into());
    }
    let Some(entry) = dictionary.lookup(key)? else {
        return Err(format!("key not found: {key}").into());
    };
    let text = dictionary.decode_record_lossy(&entry.record);
    let mut stdout = io::stdout().lock();
    stdout.write_all(text.as_bytes())?;
    stdout.flush()?;
    Ok(())
}

fn extract_resource(dictionary: &Mdict, key: &str) -> Result<(), Box<dyn std::error::Error>> {
    if dictionary.kind() != FileKind::Mdd {
        return Err("-x/--extract requires an .mdd dictionary".into());
    }
    let Some(entry) = dictionary.lookup(key)? else {
        return Err(format!("resource not found: {key}").into());
    };
    let mut stdout = io::stdout().lock();
    stdout.write_all(&entry.record)?;
    stdout.flush()?;
    Ok(())
}

fn parse_key_and_path(
    values: Vec<String>,
) -> Result<(String, PathBuf), Box<dyn std::error::Error>> {
    let [key, path] = values.as_slice() else {
        return Err("expected KEY FILE".into());
    };
    Ok((key.clone(), Path::new(path).to_path_buf()))
}
