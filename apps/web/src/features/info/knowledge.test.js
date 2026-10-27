import { describe, expect, it } from 'vitest';
import { FOLDERS, ARTICLES, FAQ, GLOSSARY, FEATURED, readMinutes, folderOf, articleOf, articlesIn, countIn, searchKnowledge } from './knowledge.js';
import { libraryGroups, libCategoryLabel } from '../app/library.js';

describe('ศูนย์ความรู้', () => {
  it('ทุกบทความอยู่ในโฟลเดอร์ที่มีจริง และบทความแนะนำมีอยู่จริง', () => {
    for (const a of ARTICLES) {
      expect(folderOf(a.folder), a.id).toBeTruthy();
      expect(readMinutes(a)).toBeGreaterThanOrEqual(1);
    }
    for (const id of FEATURED) expect(articleOf(id), id).toBeTruthy();
    for (const f of FOLDERS) expect(countIn(f)).toBeGreaterThanOrEqual(0);
    expect(articlesIn(ARTICLES[0].folder).length).toBeGreaterThan(0);
  });

  it('ค้นหาบทความ คำถาม และคำศัพท์ (ชื่อเรื่องตรงขึ้นก่อน)', () => {
    expect(searchKnowledge('   ')).toEqual([]);
    const hits = searchKnowledge('ภาษี');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].score).toBeGreaterThanOrEqual(hits[hits.length - 1].score);
    expect(searchKnowledge(FAQ[0][0].slice(0, 6)).some((h) => h.kind === 'faq')).toBe(true);
    expect(searchKnowledge(GLOSSARY[0][0]).some((h) => h.kind === 'term')).toBe(true);
    const cat = FOLDERS.find((f) => f.cat).cat;
    for (const h of searchKnowledge('ภาษี', cat)) expect(['article', 'faq', 'term']).toContain(h.kind);
  });
});

describe('หมวดคลังเอกสาร', () => {
  it('มีหมวดของทุกบทบาท และชื่อหมวดจาก id', () => {
    for (const role of ['creator', 'corporate', 'agency', 'unknown']) expect(libraryGroups(role).length).toBeGreaterThan(0);
    const first = libraryGroups('creator')[0].items[0];
    expect(libCategoryLabel(first.id)).toBe(first.label);
    expect(libCategoryLabel('ไม่มีหมวดนี้')).toBe('ไม่มีหมวดนี้');
  });
});
