import { FastifyRequest, FastifyReply } from 'fastify';
import mongoose from 'mongoose';
import { Persona, IPersona } from '../models';
import { z } from 'zod';

const CreatePersonaSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  category: z.enum(['coding', 'analysis', 'writing', 'reasoning', 'creative', 'technical', 'customer_support', 'educational', 'custom']).default('custom'),
  tags: z.array(z.string()).default([]),
  config: z.record(z.any()),
  isDefault: z.boolean().default(false),
});

const UpdatePersonaSchema = CreatePersonaSchema.partial();

export async function personaRoutes(fastify: any) {
  fastify.get('/', async (request: FastifyRequest<{ Querystring: { category?: string; isDefault?: boolean; search?: string } }>, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const query: any = { userId: new mongoose.Types.ObjectId(userId) };
    if (request.query.category) query.category = request.query.category;
    if (request.query.isDefault !== undefined) query.isDefault = request.query.isDefault;
    if (request.query.search) {
      query.$or = [
        { name: new RegExp(request.query.search, 'i') },
        { description: new RegExp(request.query.search, 'i') },
        { tags: new RegExp(request.query.search, 'i') },
      ];
    }

    const personas = await Persona.find(query).sort({ updatedAt: -1 }).lean();
    return personas;
  });

  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const persona = await Persona.findOne({ _id: request.params.id, userId: new mongoose.Types.ObjectId(userId) });
    if (!persona) return reply.status(404).send({ error: 'Persona not found' });
    return persona;
  });

  fastify.post('/', async (request: FastifyRequest<{ Body: any }>, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const data = CreatePersonaSchema.parse(request.body);
    
    if (data.isDefault) {
      await Persona.updateMany({ userId: new mongoose.Types.ObjectId(userId), isDefault: true }, { $set: { isDefault: false } });
    }

    const persona = new Persona({ ...data, userId: new mongoose.Types.ObjectId(userId) });
    await persona.save();
    return reply.status(201).send(persona);
  });

  fastify.put('/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: any }>, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const data = UpdatePersonaSchema.parse(request.body);

    if (data.isDefault) {
      await Persona.updateMany({ userId: new mongoose.Types.ObjectId(userId), _id: { $ne: request.params.id }, isDefault: true }, { $set: { isDefault: false } });
    }

    const persona = await Persona.findOneAndUpdate({ _id: request.params.id, userId: new mongoose.Types.ObjectId(userId) }, { $set: data }, { new: true });
    if (!persona) return reply.status(404).send({ error: 'Persona not found' });
    return persona;
  });

  fastify.delete('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const persona = await Persona.findOneAndDelete({ _id: request.params.id, userId: new mongoose.Types.ObjectId(userId) });
    if (!persona) return reply.status(404).send({ error: 'Persona not found' });
    return { success: true };
  });

  fastify.post('/:id/duplicate', async (request: FastifyRequest<{ Params: { id: string }; Body: { name?: string } }>, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    const original = await Persona.findOne({ _id: request.params.id, userId: new mongoose.Types.ObjectId(userId) });
    if (!original) return reply.status(404).send({ error: 'Persona not found' });

    const duplicate = new Persona({
      ...original.toObject(),
      _id: new mongoose.Types.ObjectId(),
      name: request.body.name || `${original.name} (Copy)`,
      isDefault: false,
      userId: new mongoose.Types.ObjectId(userId),
    });
    await duplicate.save();
    return reply.status(201).send(duplicate);
  });

  fastify.post('/:id/activate', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const userId = (request as any).user?.id;
    if (!userId) return reply.status(401).send({ error: 'Unauthorized' });

    await Persona.updateMany({ userId: new mongoose.Types.ObjectId(userId), isDefault: true }, { $set: { isDefault: false } });
    const persona = await Persona.findOneAndUpdate({ _id: request.params.id, userId: new mongoose.Types.ObjectId(userId) }, { $set: { isDefault: true, isActive: true } }, { new: true });
    if (!persona) return reply.status(404).send({ error: 'Persona not found' });
    return persona;
  });
}
