'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { isReservedDomain } = require('../lib/mailer');

test('โดเมนทดสอบตาม RFC 2606/6761 ไม่ส่งอีเมลออกจริง (บัญชีทดลองของระบบ)', () => {
  for (const a of ['creator@taxflow.test', 'agency@taxflow.test', 'a@b.example', 'x@foo.invalid',
    'x@localhost.localhost', 'nusnee@example.com', 'x@mail.example.org', 'X@TAXFLOW.TEST']) {
    assert.equal(isReservedDomain(a), true, a);
  }
});

test('อีเมลจริงยังส่งตามปกติ ไม่ถูกจับผิดว่าเป็นโดเมนทดสอบ', () => {
  for (const a of ['someone@gmail.com', 'ap@branddee.co.th', 'x@testing.com', 'x@mytest.io',
    'x@example.co.th', 'x@notexample.com', 'x@test.com']) {
    assert.equal(isReservedDomain(a), false, a);
  }
});
