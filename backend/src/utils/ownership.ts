import { Response } from 'express';
import { USER_ROLES } from '../constants/enums';

/**
 * Check if a patient owns a resource and send 403 if not.
 * Call this after the resource is fetched.
 * Returns true if access is allowed, false otherwise.
 */
export function checkPatientOwnership(
  patientId: string,
  userId: string,
  res: Response
): boolean {
  if (patientId !== userId) {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  return true;
}

/**
 * Check if a patient owns a resource, but only enforce for PATIENT role.
 * Admins/adjusters/finance have unrestricted access.
 * Returns true if access is allowed, false otherwise.
 */
export function checkPatientOwnershipIfPatient(
  role: string,
  patientId: string,
  userId: string,
  res: Response
): boolean {
  if (role === USER_ROLES.PATIENT && patientId !== userId) {
    res.status(403).json({ error: 'Access denied' });
    return false;
  }
  return true;
}
