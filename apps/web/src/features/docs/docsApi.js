/**
 * docsApi.js เส้นทาง API ของเอกสาร ลายเซ็น ไฟล์แนบ คำขอลงนาม และการแชร์ (routes/documents, docsign, attachments, requests)
 */
import { api } from '../../lib/api.js';

const id = (v) => Number(v);

export const docsApi = {
  list: (params = '') => api.get(`/api/documents${params ? `?${params}` : ''}`),
  get: (docId) => api.get(`/api/documents/${id(docId)}`),
  update: (docId, body) => api.put(`/api/documents/${id(docId)}`, body),
  setStatus: (docId, status, note = '') => api.post(`/api/documents/${id(docId)}/status`, { status, note }),
  remove: (docId) => api.del(`/api/documents/${id(docId)}`),
  duplicate: (docId) => api.post(`/api/documents/${id(docId)}/duplicate`),
  share: (docId) => api.post(`/api/documents/${id(docId)}/share`),

  addAttachment: (docId, body) => api.post(`/api/documents/${id(docId)}/attachments`, body),
  delAttachment: (attId) => api.del(`/api/attachments/${id(attId)}`),

  sign: (docId, body) => api.post(`/api/documents/${id(docId)}/sign`, body),
  savedSignatures: () => api.get('/api/signatures'),
  saveSignature: (body) => api.post('/api/signatures', body),
  delSignature: (sigId) => api.del(`/api/signatures/${id(sigId)}`),

  requests: (docId) => api.get(`/api/documents/${id(docId)}/requests`),
  sendRequest: (docId, body) => api.post(`/api/documents/${id(docId)}/request`, body),
  cancelRequest: (reqId) => api.post(`/api/requests/${id(reqId)}/cancel`),
};

/** อ่านไฟล์เป็น data URL (data:mime;base64,...) */
export function readDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error('อ่านไฟล์ไม่สำเร็จ'));
    fr.readAsDataURL(file);
  });
}
