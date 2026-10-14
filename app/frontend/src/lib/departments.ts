export const CANONICAL_DEPARTMENTS = [
  'Civil Engineering Department',
  'Architecture Department',
  'Electrical Engineering Department',
  'Computer Engineering Department',
  'Mechanical Engineering Department',
  'Electronics Engineering Department',
  'Geodetic Engineering',
] as const;

export type CanonicalDepartment = (typeof CANONICAL_DEPARTMENTS)[number];

export const normalizeDepartmentKey = (department: string): string => department.trim().replace(/\s+/g, ' ').toLowerCase();

export const isCanonicalDepartment = (department: string | undefined): department is CanonicalDepartment =>
  Boolean(department && CANONICAL_DEPARTMENTS.includes(department as CanonicalDepartment));
