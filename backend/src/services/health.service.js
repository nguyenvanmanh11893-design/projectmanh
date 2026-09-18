// Share an in-flight probe: repeated timeouts must not fill the DB pool.
export function createReadiness(probe, { timeoutMs = 2000, isStopping = () => false } = {}) {
  let pending;
  return async () => {
    if (isStopping()) return false;
    if (!pending) pending = Promise.resolve().then(probe).then(() => true, () => false).finally(() => { pending = null; });
    let timer;
    try {
      const ready = await Promise.race([pending, new Promise((resolve) => { timer = setTimeout(() => resolve(false), timeoutMs); })]);
      return ready && !isStopping();
    }
    finally { clearTimeout(timer); }
  };
}
