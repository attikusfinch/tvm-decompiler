import test from 'node:test';
import assert from 'node:assert/strict';
import {publicationWebConfig, pageToken} from '../scripts/verifier-web.mjs';

test('tunnel accepts only its configured HTTPS origin and the local operator origin', () => {
    const config = publicationWebConfig(8099, 'https://example.ngrok-free.app');
    assert.deepEqual([...config.hosts], ['127.0.0.1:8099', 'example.ngrok-free.app']);
    assert.deepEqual([...config.origins], ['http://127.0.0.1:8099', 'https://example.ngrok-free.app']);
    for (const value of ['http://example.com', 'https://example.com/path', 'https://user:pass@example.com',
        'https://example.com/?q=1', 'https://example.com/#token'])
        assert.throws(() => publicationWebConfig(8099, value));
});

test('public HTML does not contain the private queue credential', () => {
    assert.equal(pageToken(publicationWebConfig(8099, 'https://example.ngrok-free.app'), 'private'), '');
    assert.equal(pageToken(publicationWebConfig(8099), 'private'), 'private');
});
