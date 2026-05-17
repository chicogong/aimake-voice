import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useJobStream } from '../hooks/useJobStream';

// ---------------------------------------------------------------------------
// MockEventSource
// ---------------------------------------------------------------------------
type ListenerFn = (e: MessageEvent) => void;

class MockEventSource {
  static instances: MockEventSource[] = [];

  url: string;
  onopen: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private listeners: Map<string, ListenerFn[]> = new Map();
  private closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.instances.push(this);
  }

  addEventListener(type: string, fn: ListenerFn) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, []);
    }
    this.listeners.get(type)!.push(fn);
  }

  close() {
    this.closed = true;
  }

  /** Dispatch a MessageEvent carrying JSON-serialised dataObj to all listeners of type. */
  emit(type: string, dataObj: unknown) {
    const event = new MessageEvent(type, { data: JSON.stringify(dataObj) });
    const fns = this.listeners.get(type) ?? [];
    fns.forEach((fn) => fn(event));
  }

  /** Dispatch a MessageEvent with a raw (possibly malformed) string payload. */
  emitRaw(type: string, rawString: string) {
    const event = new MessageEvent(type, { data: rawString });
    const fns = this.listeners.get(type) ?? [];
    fns.forEach((fn) => fn(event));
  }

  /** Simulate a successful connection open. */
  triggerOpen() {
    this.onopen?.();
  }
}

// ---------------------------------------------------------------------------
// Mock the api helper so the hook builds deterministic URLs
// ---------------------------------------------------------------------------
vi.mock('../services/api', () => ({
  getJobStreamUrl: (jobId: string, token: string) => `http://test/stream/${jobId}?token=${token}`,
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('useJobStream', () => {
  beforeEach(() => {
    MockEventSource.instances = [];
    vi.stubGlobal('EventSource', MockEventSource);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('1. initial state is pending/0/not connected', () => {
    const { result } = renderHook(() => useJobStream('job-1', 'tok-1'));
    expect(result.current.status).toBe('pending');
    expect(result.current.progress).toBe(0);
    expect(result.current.isConnected).toBe(false);
  });

  it('2. isConnected becomes true after triggerOpen', () => {
    const { result } = renderHook(() => useJobStream('job-1', 'tok-1'));
    const es = MockEventSource.instances[0];

    act(() => {
      es.triggerOpen();
    });

    expect(result.current.isConnected).toBe(true);
  });

  it('3. progress event updates status, progress, and currentStage', () => {
    const { result } = renderHook(() => useJobStream('job-1', 'tok-1'));
    const es = MockEventSource.instances[0];

    act(() => {
      es.triggerOpen();
    });

    act(() => {
      es.emit('progress', {
        type: 'progress',
        status: 'scripting',
        progress: 50,
        currentStage: 'scripting',
      });
    });

    expect(result.current.status).toBe('scripting');
    expect(result.current.progress).toBe(50);
    expect(result.current.currentStage).toBe('scripting');
  });

  it('4. complete event sets status completed, progress 100, audioUrl, and disconnects', () => {
    const { result } = renderHook(() => useJobStream('job-1', 'tok-1'));
    const es = MockEventSource.instances[0];

    act(() => {
      es.triggerOpen();
    });

    act(() => {
      es.emit('complete', { type: 'complete', audioUrl: 'r2-key', duration: 120 });
    });

    expect(result.current.status).toBe('completed');
    expect(result.current.progress).toBe(100);
    expect(result.current.audioUrl).toBe('r2-key');
    expect(result.current.isConnected).toBe(false);
  });

  it('5. error event sets status failed and populates error', () => {
    const { result } = renderHook(() => useJobStream('job-1', 'tok-1'));
    const es = MockEventSource.instances[0];

    act(() => {
      es.triggerOpen();
    });

    act(() => {
      es.emit('error', { type: 'error', code: 'JOB_ERROR', message: 'boom' });
    });

    expect(result.current.status).toBe('failed');
    expect(result.current.error).toEqual({ code: 'JOB_ERROR', message: 'boom' });
  });

  it('6. malformed JSON payload is dropped and state is unchanged', () => {
    const { result } = renderHook(() => useJobStream('job-1', 'tok-1'));
    const es = MockEventSource.instances[0];

    act(() => {
      es.triggerOpen();
    });

    act(() => {
      es.emitRaw('progress', '{not valid json');
    });

    expect(result.current.status).toBe('pending');
    expect(result.current.progress).toBe(0);
  });

  it('7. no EventSource is created when jobId or token is null', () => {
    renderHook(() => useJobStream(null, null));
    expect(MockEventSource.instances).toHaveLength(0);
  });
});
