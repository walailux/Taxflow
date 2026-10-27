import { describe, expect, it } from 'vitest';
import { isJuristic, userToForm, checkProfileField, profileErrors, buildProfileBody, bankChanged } from './profileRules.js';
import { visibleFields, contactToForm, checkContactField, contactErrors, formToBody, EMPTY_CONTACT } from '../contacts/contactRules.js';

const company = {
  role: 'corporate', entityType: 'juristic', companyName: 'บริษัท ทดสอบ จำกัด', displayName: 'บริษัท ทดสอบ จำกัด', taxId: '0105561112235',
  branchType: 'branch', branchCode: '00001', authName: 'สมชาย ใจดี', authPosition: 'กรรมการ', vatRegistered: true, vatRegDate: '2562-04-01',
  addr: { no: '55', street: 'สาทร', subdistrict: 'ทุ่งมหาเมฆ', district: 'สาทร', province: 'กรุงเทพมหานคร', postcode: '10120' },
  phone: '02-111-2233', bank: { bankName: 'ธนาคารกสิกรไทย', accountNo: '0123456789', accountName: 'บริษัท ทดสอบ จำกัด' },
};

describe('ฟอร์มโปรไฟล์', () => {
  it('นิติบุคคลตามบทบาท', () => {
    expect(isJuristic({ role: 'corporate' })).toBe(true);
    expect(isJuristic({ role: 'agency', entityType: 'individual' }, 'juristic')).toBe(true);
    expect(isJuristic({ role: 'agency', entityType: 'individual' })).toBe(false);
    expect(isJuristic({ role: 'creator', entityType: 'individual' })).toBe(false);
  });

  it('ผู้ใช้ → ฟอร์ม (แปลงปี พ.ศ. ของวันจด VAT) → body ที่ส่ง API', () => {
    const f = userToForm(company);
    expect(f).toMatchObject({ entityType: 'juristic', name: 'บริษัท ทดสอบ จำกัด', vat: 'yes', vatRegDate: '2019-04-01', addrPost: '10120', bankNo: '0123456789' });
    const body = buildProfileBody(f, company);
    expect(body).toMatchObject({ companyName: 'บริษัท ทดสอบ จำกัด', branchCode: '00001', vatRegistered: true, addr: { postcode: '10120' } });
    expect(bankChanged(body, company)).toBe(false);
    expect(bankChanged({ bank: { ...body.bank, accountNo: '999' } }, company)).toBe(true);

    const person = buildProfileBody({ ...userToForm({ role: 'creator', displayName: 'นาย ก' }), name: ' นาย ก ', vat: 'no' }, { role: 'creator' });
    expect(person).toMatchObject({ entityType: 'individual', displayName: 'นาย ก', companyName: '', authName: '', vatRegDate: '', branchType: 'head' });
    expect(userToForm({ role: 'creator', vatRegDate: '2020-01-01' }).vatRegDate).toBe('2020-01-01');
  });

  it('ตรวจช่องที่จำเป็นตามประเภทผู้ใช้', () => {
    const errs = profileErrors({ ...userToForm({ role: 'corporate' }), branchType: 'branch', vat: 'yes', bankNo: '123' }, { role: 'corporate' });
    for (const k of ['name', 'taxId', 'authName', 'branchCode', 'vatRegDate', 'addrNo', 'addrPost', 'bankAcc']) expect(errs[k], k).toBeTruthy();
    expect(profileErrors(userToForm(company), company)).toEqual({});
    expect(checkProfileField('unknown', {}, company)).toBeNull();
  });
});

describe('ฟอร์มคู่ค้า', () => {
  it('ช่องที่แสดงตามชนิดคู่ค้า', () => {
    expect(visibleFields({ kind: 'influencer', entityType: 'individual' })).toEqual({ authName: false, channelName: true, socials: true, tradeName: false });
    expect(visibleFields({ kind: 'brand', entityType: 'juristic' }).authName).toBe(true);
  });

  it('คู่ค้า → ฟอร์ม → body (ตัดช่องที่ไม่แสดง)', () => {
    const f = contactToForm({ id: 3, name: 'นาย ก', taxId: '1100700123455', kind: 'influencer', bank: '111', channelName: 'ช่อง' });
    expect(f).toMatchObject({ id: 3, entityType: 'individual', bankAccountNo: '111', kind: 'influencer' });
    expect(contactToForm({ id: 4, name: 'บ', taxId: '0105561234567' }).entityType).toBe('juristic');
    const body = formToBody({ ...EMPTY_CONTACT, name: ' บริษัท ', kind: 'brand', entityType: 'individual', authName: 'x', channelName: 'y', socials: 'z' });
    expect(body).toMatchObject({ name: 'บริษัท', authName: '', authPosition: '', channelName: '', socials: '' });
  });

  it('ตรวจข้อมูลคู่ค้า', () => {
    const errs = contactErrors({ ...EMPTY_CONTACT, taxId: '123', bankAccountNo: '123456' });
    expect(errs.name).toBeTruthy();
    expect(errs.taxId).toBeTruthy();
    expect(errs.bankAccountName).toBeTruthy();
    expect(contactErrors({ ...EMPTY_CONTACT, name: 'บริษัท ทดสอบ จำกัด' })).toEqual({});
    expect(checkContactField('kind', EMPTY_CONTACT)).toBeNull();
  });
});
