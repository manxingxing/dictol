import { execFileSync } from 'node:child_process'

const run = (directory) => {
  execFileSync('npm', ['--prefix', directory, 'run', 'build'], {
    stdio: 'inherit'
  })
}

run('native/mdict-node')
