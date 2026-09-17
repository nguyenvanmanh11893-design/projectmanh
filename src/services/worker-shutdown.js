// Arm the hard deadline before awaiting any potentially blocked operation.
export const createWorkerShutdown = ({ timeoutMs, stop, isActive, close, exit, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }) => {
  let stopping = false;
  return async () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => exit(1), timeoutMs);
    stop();
    try {
      while (isActive()) await sleep(50);
      await close();
      clearTimeout(deadline);
      exit(0);
    } catch {
      clearTimeout(deadline);
      exit(1);
    }
  };
};
