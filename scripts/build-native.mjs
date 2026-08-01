import { execFileSync } from 'node:child_process'

const run = (directory) => {
  if (process.platform === 'win32') {
    execFileSync('cmd.exe', ['/c', 'npm', '--prefix', directory, 'run', 'build'], {
      stdio: 'inherit'
    })
  } else {
    execFileSync('npm', ['--prefix', directory, 'run', 'build'], {
      stdio: 'inherit'
    })
  }
}

run('native/mdict-node')
