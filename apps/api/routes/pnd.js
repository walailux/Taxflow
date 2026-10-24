'use strict';
/** จัดทำข้อมูล ภ.ง.ด.3 และ ภ.ง.ด.53 — แยกจาก server.js เดิมใน WP1 (ตรรกะไม่เปลี่ยน) */
const express = require('express');
const { sendJson, requireAuth,
} = require('../core/context');
const { pndCandidates,
} = require('../core/docs');

const api = express.Router();
api.get('/api/pnd/candidates', requireAuth(async (req, res) => {
  const p = new URL(req.url, 'http://localhost').searchParams;
  const form = p.get('form');
  if (!['PND3', 'PND53'].includes(form)) return sendJson(res, 400, { error: 'แบบไม่ถูกต้อง' });
  const month = Number(p.get('month')), yearBE = Number(p.get('yearBE'));
  if (!(month >= 1 && month <= 12) || !(yearBE > 2500)) return sendJson(res, 400, { error: 'กรุณาเลือกเดือนและปีภาษี (พ.ศ.)' });
  sendJson(res, 200, await pndCandidates(req.user, form, month, yearBE));
}));

module.exports = api;
