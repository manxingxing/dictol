use std::io::{self, Write};
use std::path::PathBuf;

use clap::{ArgGroup, CommandFactory, Parser};
use mdict::{Mdd, Mdict, Mdx, Result};

#[derive(Debug, Parser)]
#[command(
    name = "mdict",
    about = "Inspect and query MDX/MDD dictionaries",
    disable_help_flag = true,
    group(ArgGroup::new("operation").required(true).multiple(false).args([
        "header",
        "keys",
        "key",
        "all_key",
        "lookup",
        "lookup_all",
        "prefix",
        "extract"
    ]))
)]
struct Cli {
    /// Print the decoded Header XML.
    #[arg(short = 'h', long = "header")]
    header: bool,

    /// List every key and its logical record range.
    #[arg(long = "keys")]
    keys: bool,

    /// Find one key and print its logical record range.
    #[arg(short = 'k', long = "key", value_name = "KEY")]
    key: Option<String>,

    /// Find every exact key and print their logical record ranges.
    #[arg(short = 'K', long = "all-key", value_name = "KEY")]
    all_key: Option<String>,

    /// Look up an MDX key and print decoded text.
    #[arg(short = 'l', long = "lookup", value_name = "KEY")]
    lookup: Option<String>,

    /// Look up every exact MDX key and print decoded text in file order.
    #[arg(short = 'L', long = "lookup-all", value_name = "KEY")]
    lookup_all: Option<String>,

    /// Stream keys whose comparison value starts with PREFIX.
    #[arg(short = 'p', long = "prefix", value_name = "PREFIX")]
    prefix: Option<String>,

    /// Extract an MDD resource to stdout.
    #[arg(short = 'x', long = "extract", value_name = "KEY")]
    extract: Option<String>,

    /// Input .mdx or .mdd file.
    #[arg(value_name = "FILE")]
    file: PathBuf,
}

/// 解析 CLI 参数、报告错误并设置进程退出码。
fn main() {
    if std::env::args_os().any(|argument| argument == "--help") {
        let mut command = Cli::command();
        command
            .print_long_help()
            .expect("stdout should be writable");
        println!();
        return;
    }
    if let Err(error) = run(Cli::parse()) {
        eprintln!("mdict: {error}");
        std::process::exit(1);
    }
}

/// 仅通过公开 library API 执行选定的命令。
fn run(cli: Cli) -> Result<()> {
    if cli.header {
        let dictionary = Mdict::open(&cli.file)?;
        println!("{}", dictionary.metadata().raw_header);
    } else if cli.keys {
        let dictionary = Mdict::open(&cli.file)?;
        for key in dictionary.keys() {
            let key = key?;
            println!("{}\t{}\t{}", key.text, key.record_start, key.record_end);
        }
    } else if let Some(query) = cli.key {
        let dictionary = Mdict::open(&cli.file)?;
        if let Some(key) = dictionary.find_key(&query)? {
            println!("{}\t{}\t{}", key.text, key.record_start, key.record_end);
        }
    } else if let Some(query) = cli.all_key {
        let dictionary = Mdict::open(&cli.file)?;
        for key in dictionary.find_keys(&query)? {
            println!("{}\t{}\t{}", key.text, key.record_start, key.record_end);
        }
    } else if let Some(query) = cli.lookup {
        let dictionary = Mdx::open(&cli.file)?;
        if let Some(text) = dictionary.lookup_text(&query)? {
            print!("{text}");
        }
    } else if let Some(query) = cli.lookup_all {
        let dictionary = Mdx::open(&cli.file)?;
        for text in dictionary.lookup_all_text(&query)? {
            print!("{text}");
        }
    } else if let Some(prefix) = cli.prefix {
        let dictionary = Mdict::open(&cli.file)?;
        for key in dictionary.prefix(&prefix)? {
            let key = key?;
            println!("{}\t{}\t{}", key.text, key.record_start, key.record_end);
        }
    } else if let Some(query) = cli.extract {
        let dictionary = Mdd::open(&cli.file)?;
        if let Some(resource) = dictionary.lookup(&query)? {
            io::stdout()
                .lock()
                .write_all(&resource.data)
                .map_err(|error| mdict::Error::Io {
                    path: PathBuf::from("<stdout>"),
                    source: error,
                })?;
        }
    }
    Ok(())
}
