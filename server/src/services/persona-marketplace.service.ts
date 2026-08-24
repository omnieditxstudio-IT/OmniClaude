import mongoose from 'mongoose';
import { Persona } from '../models';

export interface PersonaMarketplaceItem {
  _id: string;
  personaId: string;
  userId: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  downloads: number;
  rating: number;
  ratingCount: number;
  isPublic: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface PersonaShareResponse {
  shareUrl: string;
  marketplaceUrl?: string;
  isPublic: boolean;
}

export class PersonaMarketplaceService {
  static async sharePersona(
    personaId: string,
    userId: string,
    isPublic = true
  ): Promise<PersonaShareResponse> {
    const persona = await Persona.findOne({ _id: personaId, userId: new mongoose.Types.ObjectId(userId) });
    if (!persona) {
      throw new Error('Persona not found');
    }

    const shareToken = this.generateShareToken(personaId);
    const shareUrl = `${process.env.GATEWAY_URL || 'http://localhost:3000'}/api/personas/share/${shareToken}`;
    const marketplaceUrl = isPublic ? `${process.env.GATEWAY_URL || 'http://localhost:3000'}/marketplace/personas/${personaId}` : undefined;

    // In a real implementation, you would store the share token and marketplace listing
    // For now, we return the URLs
    return {
      shareUrl,
      marketplaceUrl,
      isPublic,
    };
  }

  static async unsharePersona(personaId: string, userId: string): Promise<void> {
    const persona = await Persona.findOne({ _id: personaId, userId: new mongoose.Types.ObjectId(userId) });
    if (!persona) {
      throw new Error('Persona not found');
    }

    // In a real implementation, remove from marketplace
  }

  static async getMarketplacePersonas(
    category?: string,
    search?: string,
    limit = 20,
    offset = 0
  ): Promise<PersonaMarketplaceItem[]> {
    // In a real implementation, query marketplace collection
    // For now, return public personas
    const query: any = { isActive: true };
    if (category) query.category = category;
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') },
        { description: new RegExp(search, 'i') },
        { tags: new RegExp(search, 'i') },
      ];
    }

    const personas = await Persona.find(query)
      .sort({ updatedAt: -1 })
      .limit(limit)
      .skip(offset)
      .lean();

    return personas.map(p => ({
      _id: p._id.toString(),
      personaId: p._id.toString(),
      userId: p.userId?.toString() || '',
      name: p.name,
      description: p.description || '',
      category: p.category || 'custom',
      tags: p.tags || [],
      downloads: 0,
      rating: 0,
      ratingCount: 0,
      isPublic: true,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })) as PersonaMarketplaceItem[];
  }

  static async importFromMarketplace(marketplaceItemId: string, userId: string): Promise<any> {
    // In a real implementation, fetch from marketplace and create a copy
    // For now, return a placeholder
    return {
      message: 'Marketplace import not fully implemented',
      marketplaceItemId,
      userId,
    };
  }

  private static generateShareToken(personaId: string): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 15);
    return `${personaId}-${timestamp}-${random}`;
  }
}
