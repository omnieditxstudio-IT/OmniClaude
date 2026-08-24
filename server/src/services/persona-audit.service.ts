import mongoose from 'mongoose';
import { PersonaAuditLog, IPersonaAuditLog } from '../models';

export type PersonaAuditAction = 'created' | 'updated' | 'deleted' | 'activated' | 'duplicated' | 'tested';

export interface AuditLogEntry {
  personaId: string;
  userId: string;
  action: PersonaAuditAction;
  details?: Record<string, any>;
  previousState?: Record<string, any>;
  newState?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
}

export class PersonaAuditService {
  static async log(entry: AuditLogEntry): Promise<IPersonaAuditLog> {
    const log = new PersonaAuditLog({
      personaId: new mongoose.Types.ObjectId(entry.personaId),
      userId: new mongoose.Types.ObjectId(entry.userId),
      action: entry.action,
      details: entry.details || {},
      previousState: entry.previousState,
      newState: entry.newState,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    });

    await log.save();
    return log;
  }

  static async getLogsForPersona(personaId: string, limit = 50, offset = 0): Promise<IPersonaAuditLog[]> {
    return PersonaAuditLog.find({ personaId: new mongoose.Types.ObjectId(personaId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();
  }

  static async getLogsForUser(userId: string, limit = 50, offset = 0): Promise<IPersonaAuditLog[]> {
    return PersonaAuditLog.find({ userId: new mongoose.Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();
  }

  static async getLogsByAction(action: PersonaAuditAction, limit = 50, offset = 0): Promise<IPersonaAuditLog[]> {
    return PersonaAuditLog.find({ action })
      .sort({ createdAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();
  }

  static async getRecentLogs(limit = 100): Promise<IPersonaAuditLog[]> {
    return PersonaAuditLog.find()
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  }
}
