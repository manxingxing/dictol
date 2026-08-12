use std::collections::{HashMap, HashSet, VecDeque};
use std::hash::Hash;
use std::sync::{Arc, Condvar, Mutex};

use crate::Result;

/// A byte-weighted, single-flight cache for decoded blocks.
#[derive(Debug)]
pub(crate) struct BlockCache<K> {
    capacity: usize,
    state: Mutex<State<K>>,
    ready: Condvar,
}

#[derive(Debug)]
struct State<K> {
    values: HashMap<K, Arc<[u8]>>,
    order: VecDeque<K>,
    loading: HashSet<K>,
    bytes: usize,
}

impl<K> BlockCache<K>
where
    K: Copy + Eq + Hash,
{
    /// 创建一个以解压后字节数为容量单位的缓存。
    pub(crate) fn new(capacity: usize) -> Self {
        Self {
            capacity,
            state: Mutex::new(State {
                values: HashMap::new(),
                order: VecDeque::new(),
                loading: HashSet::new(),
                bytes: 0,
            }),
            ready: Condvar::new(),
        }
    }

    /// 读取缓存；未命中时保证同一个 key 只有一个线程执行加载函数。
    pub(crate) fn get_or_try_insert<F>(&self, key: K, load: F) -> Result<Arc<[u8]>>
    where
        F: FnOnce() -> Result<Arc<[u8]>>,
    {
        if self.capacity == 0 {
            return load();
        }
        let mut state = self.state.lock().expect("block cache mutex poisoned");
        loop {
            if let Some(value) = state.values.get(&key).cloned() {
                touch(&mut state.order, key);
                return Ok(value);
            }
            if state.loading.insert(key) {
                break;
            }
            state = self.ready.wait(state).expect("block cache mutex poisoned");
        }
        drop(state);

        let loaded = load();
        let mut state = self.state.lock().expect("block cache mutex poisoned");
        state.loading.remove(&key);
        if let Ok(value) = &loaded {
            let weight = value.len();
            if weight <= self.capacity {
                while state.bytes.saturating_add(weight) > self.capacity {
                    let Some(old_key) = state.order.pop_front() else {
                        break;
                    };
                    if let Some(old) = state.values.remove(&old_key) {
                        state.bytes -= old.len();
                    }
                }
                state.bytes += weight;
                state.values.insert(key, value.clone());
                state.order.push_back(key);
            }
        }
        self.ready.notify_all();
        loaded
    }
}

/// 将刚访问的 key 移到 LRU 顺序末端。
fn touch<K: Copy + Eq>(order: &mut VecDeque<K>, key: K) {
    if let Some(index) = order.iter().position(|candidate| *candidate == key) {
        order.remove(index);
    }
    order.push_back(key);
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::thread;

    use super::BlockCache;

    #[test]
    /// 验证超过字节容量时会淘汰最久未访问的解压块。
    fn evicts_by_decoded_byte_weight() {
        let cache = BlockCache::new(5);
        let loads = AtomicUsize::new(0);
        for key in [1, 2, 1] {
            cache
                .get_or_try_insert(key, || {
                    loads.fetch_add(1, Ordering::Relaxed);
                    Ok(Arc::from([key; 3]))
                })
                .unwrap();
        }
        assert_eq!(loads.load(Ordering::Relaxed), 3);
    }

    #[test]
    /// 验证容量足够时重复访问直接复用缓存值，不再次执行加载函数。
    fn reuses_cached_value() {
        let cache = BlockCache::new(16);
        let loads = AtomicUsize::new(0);
        for _ in 0..3 {
            cache
                .get_or_try_insert(1_u32, || {
                    loads.fetch_add(1, Ordering::Relaxed);
                    Ok(Arc::from([1_u8; 4]))
                })
                .unwrap();
        }
        assert_eq!(loads.load(Ordering::Relaxed), 1);
    }

    #[test]
    /// 验证多个线程同时未命中同一 block 时只执行一次加载函数。
    fn coalesces_concurrent_misses() {
        let cache = Arc::new(BlockCache::new(1024));
        let loads = Arc::new(AtomicUsize::new(0));
        let threads = (0..8)
            .map(|_| {
                let cache = cache.clone();
                let loads = loads.clone();
                thread::spawn(move || {
                    cache
                        .get_or_try_insert(7_u32, || {
                            loads.fetch_add(1, Ordering::Relaxed);
                            thread::yield_now();
                            Ok(Arc::from([1_u8; 64]))
                        })
                        .unwrap()
                })
            })
            .collect::<Vec<_>>();
        for thread in threads {
            assert_eq!(&*thread.join().unwrap(), &[1_u8; 64]);
        }
        assert_eq!(loads.load(Ordering::Relaxed), 1);
    }
}
