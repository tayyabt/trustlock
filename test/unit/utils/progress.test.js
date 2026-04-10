import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createProgress } from '../../../src/utils/progress.js';

// ---------------------------------------------------------------------------
// Helper: lightweight mock writable stream
// ---------------------------------------------------------------------------

function makeStream(isTTY) {
  const chunks = [];
  return {
    isTTY,
    write(s) {
      chunks.push(s);
    },
    get output() {
      return chunks.join('');
    },
    chunks,
  };
}

// ---------------------------------------------------------------------------
// Factory shape
// ---------------------------------------------------------------------------

describe('createProgress factory', () => {
  it('returns an object with tick and done functions', () => {
    const stream = makeStream(false);
    const p = createProgress(10, stream);
    assert.equal(typeof p.tick, 'function');
    assert.equal(typeof p.done, 'function');
  });

  it('returns an object with tick and done when total is 0', () => {
    const stream = makeStream(false);
    const p = createProgress(0, stream);
    assert.equal(typeof p.tick, 'function');
    assert.equal(typeof p.done, 'function');
  });
});

// ---------------------------------------------------------------------------
// TTY mode
// ---------------------------------------------------------------------------

describe('TTY mode', () => {
  it('each tick() writes a \\r-prefixed line', () => {
    const stream = makeStream(true);
    const p = createProgress(5, stream);
    p.tick();
    p.tick();
    p.tick();
    assert.equal(stream.chunks.length, 3);
    for (const chunk of stream.chunks) {
      assert.ok(chunk.startsWith('\r'), `Expected \\r prefix, got: ${JSON.stringify(chunk)}`);
    }
  });

  it('each tick() includes the correct count and total', () => {
    const stream = makeStream(true);
    const p = createProgress(5, stream);
    p.tick();
    assert.equal(stream.chunks[0], '\rFetching metadata [1/5]');
    p.tick();
    assert.equal(stream.chunks[1], '\rFetching metadata [2/5]');
  });

  it('tick() increments count by n when n is provided', () => {
    const stream = makeStream(true);
    const p = createProgress(10, stream);
    p.tick(3);
    assert.equal(stream.chunks[0], '\rFetching metadata [3/10]');
  });

  it('done() writes a final newline', () => {
    const stream = makeStream(true);
    const p = createProgress(5, stream);
    p.tick();
    p.done();
    assert.equal(stream.chunks[stream.chunks.length - 1], '\n');
  });

  it('done() does not write \r (only \n)', () => {
    const stream = makeStream(true);
    const p = createProgress(5, stream);
    p.done();
    assert.equal(stream.chunks.length, 1);
    assert.equal(stream.chunks[0], '\n');
  });
});

// ---------------------------------------------------------------------------
// Non-TTY mode
// ---------------------------------------------------------------------------

describe('non-TTY mode', () => {
  it('writes progress lines ending with \\n at ~10% intervals', () => {
    const stream = makeStream(false);
    const p = createProgress(20, stream); // interval = ceil(20 * 0.1) = 2
    for (let i = 0; i < 20; i++) p.tick();
    // Should write at ticks 2, 4, 6, 8, 10, 12, 14, 16, 18, 20 = 10 writes
    assert.equal(stream.chunks.length, 10);
    for (const chunk of stream.chunks) {
      assert.ok(
        chunk.endsWith('\n'),
        `Expected chunk to end with \\n: ${JSON.stringify(chunk)}`,
      );
    }
  });

  it('is silent between interval boundaries', () => {
    const stream = makeStream(false);
    const p = createProgress(20, stream); // interval = 2
    p.tick(); // count=1, no write (floor(1/2)=0 === floor(0/2)=0)
    assert.equal(stream.chunks.length, 0);
    p.tick(); // count=2, write (floor(2/2)=1 > 0)
    assert.equal(stream.chunks.length, 1);
    p.tick(); // count=3, no write
    assert.equal(stream.chunks.length, 1);
    p.tick(); // count=4, write
    assert.equal(stream.chunks.length, 2);
  });

  it('writes on every tick when interval is 1 (small total)', () => {
    const stream = makeStream(false);
    const p = createProgress(5, stream); // interval = ceil(0.5) = 1
    for (let i = 0; i < 5; i++) p.tick();
    // 5 progress lines (done not called here)
    assert.equal(stream.chunks.length, 5);
  });

  it('writes correct count and total in each progress line', () => {
    const stream = makeStream(false);
    const p = createProgress(10, stream); // interval = 1
    p.tick();
    assert.equal(stream.chunks[0], 'Fetching metadata [1/10]\n');
    p.tick();
    assert.equal(stream.chunks[1], 'Fetching metadata [2/10]\n');
  });

  it('done() emits a trailing newline', () => {
    const stream = makeStream(false);
    const p = createProgress(5, stream);
    p.done();
    assert.equal(stream.chunks.length, 1);
    assert.equal(stream.chunks[0], '\n');
  });

  // Edge case: total = 1 → interval = ceil(0.1) = 1 → first tick emits
  it('emits at least one line when total = 1', () => {
    const stream = makeStream(false);
    const p = createProgress(1, stream);
    p.tick();
    // tick writes, plus done writes \n
    assert.ok(stream.chunks.length >= 1);
    assert.equal(stream.chunks[0], 'Fetching metadata [1/1]\n');
  });

  // Edge case: total = 3 → interval = ceil(0.3) = 1 → every tick emits
  it('emits on every tick when total = 3', () => {
    const stream = makeStream(false);
    const p = createProgress(3, stream);
    p.tick();
    p.tick();
    p.tick();
    // 3 progress lines before done
    assert.equal(stream.chunks[0], 'Fetching metadata [1/3]\n');
    assert.equal(stream.chunks[1], 'Fetching metadata [2/3]\n');
    assert.equal(stream.chunks[2], 'Fetching metadata [3/3]\n');
  });
});

// ---------------------------------------------------------------------------
// Zero-total no-op
// ---------------------------------------------------------------------------

describe('zero total', () => {
  it('tick() is a complete no-op when total is 0', () => {
    const stream = makeStream(false);
    const p = createProgress(0, stream);
    p.tick();
    p.tick();
    assert.equal(stream.chunks.length, 0);
  });

  it('done() is a complete no-op when total is 0', () => {
    const stream = makeStream(true);
    const p = createProgress(0, stream);
    p.done();
    assert.equal(stream.chunks.length, 0);
  });

  it('tick() with n does not throw and writes nothing when total is 0', () => {
    const stream = makeStream(false);
    const p = createProgress(0, stream);
    assert.doesNotThrow(() => p.tick(5));
    assert.equal(stream.chunks.length, 0);
  });
});

// ---------------------------------------------------------------------------
// Idempotent done()
// ---------------------------------------------------------------------------

describe('idempotent done()', () => {
  it('calling done() twice produces only one write (TTY mode)', () => {
    const stream = makeStream(true);
    const p = createProgress(5, stream);
    p.done();
    p.done();
    assert.equal(stream.chunks.length, 1);
    assert.equal(stream.chunks[0], '\n');
  });

  it('calling done() twice produces only one write (non-TTY mode)', () => {
    const stream = makeStream(false);
    const p = createProgress(5, stream);
    p.done();
    p.done();
    assert.equal(stream.chunks.length, 1);
    assert.equal(stream.chunks[0], '\n');
  });

  it('calling done() three times produces only one write', () => {
    const stream = makeStream(false);
    const p = createProgress(10, stream);
    p.done();
    p.done();
    p.done();
    assert.equal(stream.chunks.length, 1);
  });
});

// ---------------------------------------------------------------------------
// Stdout isolation — no writes must go to process.stdout
// ---------------------------------------------------------------------------

describe('stdout isolation', () => {
  it('does not write to stdout during tick and done (TTY mode)', () => {
    const captured = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (...args) => {
      captured.push(args[0]);
      return true;
    };

    try {
      const stream = makeStream(true);
      const p = createProgress(5, stream);
      p.tick();
      p.tick();
      p.done();
    } finally {
      process.stdout.write = original;
    }

    assert.deepEqual(captured, []);
  });

  it('does not write to stdout during tick and done (non-TTY mode)', () => {
    const captured = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = (...args) => {
      captured.push(args[0]);
      return true;
    };

    try {
      const stream = makeStream(false);
      const p = createProgress(5, stream);
      p.tick();
      p.tick();
      p.done();
    } finally {
      process.stdout.write = original;
    }

    assert.deepEqual(captured, []);
  });
});
