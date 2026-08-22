#!/usr/bin/env tsx

import dotenv from 'dotenv';
dotenv.config();

import { connectDatabase } from '../server/src/config/database';
import { initializeBuiltinTemplates } from '../server/src/services/prompt.service';
import { User } from '../server/src/models';

async function init() {
  try {
    console.log('🔧 Initializing database and built-in templates...');
    
    await connectDatabase();
    console.log('✅ Connected to MongoDB');
    
    // Find or create a system user for built-in templates
    let systemUser = await User.findOne({ email: 'system@gateway.local' });
    if (!systemUser) {
      systemUser = await User.create({
        email: 'system@gateway.local',
        name: 'System User',
        provider: 'github',
        providerId: 'system',
        settings: {
          theme: 'system',
          requestTimeout: 60000,
        },
      });
      console.log('✅ Created system user');
    }
    
    // Initialize built-in templates
    await initializeBuiltinTemplates(systemUser._id.toString());
    console.log('✅ Initialized built-in prompt templates');
    
    console.log('\n🎉 Initialization complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Initialization failed:', error);
    process.exit(1);
  }
}

init();