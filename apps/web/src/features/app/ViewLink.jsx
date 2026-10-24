/**
 * ViewLink.jsx ลิงก์ไปหน้าจอภายในแอป (ผ่าน viewLink ใน nav.js จุดเดียว)
 */
import { Link, NavLink } from 'react-router';
import { viewLink } from './nav.js';

export default function ViewLink({ role, view, query, nav, end, className, children, ...rest }) {
  const l = viewLink(role, view, query);
  if (nav) return <NavLink to={l.to} end={end} className={className} {...rest}>{children}</NavLink>;
  return <Link to={l.to} className={className} {...rest}>{children}</Link>;
}

/** ไปหน้าจอ view ด้วยโค้ด (navigate ของ React Router) */
export function goView(navigate, role, view, query) {
  navigate(viewLink(role, view, query).to);
}
