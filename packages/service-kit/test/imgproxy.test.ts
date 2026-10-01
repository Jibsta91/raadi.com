import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { imageUrls, imgproxySigner } from '../src/imgproxy.js';

describe('imgproxy signing', () => {
  it('agrees with the official imgproxy signing example (examples/signature.py)', () => {
    const key = '943b421c9eb07c830af81030552c86009268de4e532ba2ee2eab8247c6da0881';
    const salt = '520f986b998545b4785e0defbc4f3c1203f22de2374a3d53cb7a7fe9fea309c5';
    const signer = imgproxySigner(key, salt);
    // Expected value computed with imgproxy's Python example (independent implementation).
    assert.equal(
      signer.sign('/rs:fit:300:300/plain/http://img.example.com/pretty/image.jpg'),
      'm3k5QADfcKPDj-SDI2AIogZbC3FlAXszuwhtWXYqavc',
    );
  });

  it('builds a signed URL per preset under the public prefix', () => {
    const urls = imageUrls(
      imgproxySigner('00'.repeat(32), '11'.repeat(32)),
      '3f0c5a6e-1b7d-4c2a-9e51-7a0d2b6c4f11',
    );
    assert.deepEqual(Object.keys(urls), ['thumb', 'card', 'large']);
    assert.match(urls.card, /^\/img\/[\w-]{43}\/pr:card\/[\w-]+\.webp$/);
  });
});
