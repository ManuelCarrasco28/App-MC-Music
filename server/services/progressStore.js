const progressJobs = new Map();
const JOB_TTL_MS = 5 * 60 * 1000;

export function isValidProgressJobId(jobId) {
  return typeof jobId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(jobId);
}

function getOrCreateJob(jobId) {
  let job = progressJobs.get(jobId);
  if (!job) {
    job = {
      listeners: new Set(),
      lastEvent: { progress: 0, stage: 'preparing' },
      finished: false,
      cancelHandler: null,
      cleanupTimer: null
    };
    progressJobs.set(jobId, job);
  }
  return job;
}

function sendEvent(response, payload) {
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

export function openProgressStream(jobId, response) {
  if (!isValidProgressJobId(jobId)) return false;

  const job = getOrCreateJob(jobId);
  response.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  response.flushHeaders?.();
  sendEvent(response, job.lastEvent);

  if (job.finished) {
    response.end();
    return true;
  }

  job.listeners.add(response);
  const heartbeat = setInterval(() => response.write(': keep-alive\n\n'), 15000);
  heartbeat.unref?.();

  response.on('close', () => {
    clearInterval(heartbeat);
    job.listeners.delete(response);
  });
  return true;
}

export function updateDownloadProgress(jobId, progress, stage = 'downloading') {
  if (!isValidProgressJobId(jobId)) return;
  const job = getOrCreateJob(jobId);
  if (job.finished) return;

  const normalizedProgress = Math.max(
    Number(job.lastEvent.progress) || 0,
    Math.min(99, Math.max(0, Math.round(Number(progress) || 0)))
  );
  job.lastEvent = { progress: normalizedProgress, stage };
  for (const listener of job.listeners) sendEvent(listener, job.lastEvent);
}

export function registerDownloadCancellation(jobId, cancelHandler) {
  if (!isValidProgressJobId(jobId) || typeof cancelHandler !== 'function') return false;
  const job = getOrCreateJob(jobId);
  if (job.finished) return false;
  job.cancelHandler = cancelHandler;
  return true;
}

export function cancelDownloadJob(jobId) {
  if (!isValidProgressJobId(jobId)) return false;
  const job = progressJobs.get(jobId);
  if (!job || job.finished || typeof job.cancelHandler !== 'function') return false;
  const cancelHandler = job.cancelHandler;
  job.cancelHandler = null;
  cancelHandler();
  return true;
}

export function finishDownloadProgress(jobId, error = null) {
  if (!isValidProgressJobId(jobId)) return;
  const job = getOrCreateJob(jobId);
  if (job.finished) return;

  job.finished = true;
  job.cancelHandler = null;
  job.lastEvent = error
    ? { progress: Number(job.lastEvent.progress) || 0, stage: 'error', error }
    : { progress: 100, stage: 'completed' };

  for (const listener of job.listeners) {
    sendEvent(listener, job.lastEvent);
    listener.end();
  }
  job.listeners.clear();
  clearTimeout(job.cleanupTimer);
  job.cleanupTimer = setTimeout(() => progressJobs.delete(jobId), JOB_TTL_MS);
  job.cleanupTimer.unref?.();
}
