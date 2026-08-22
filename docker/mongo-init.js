// MongoDB initialization script
// Runs on first container startup

// Create database if not exists
db = db.getSiblingDB('gateway');

// Create indexes for better performance
db.users.createIndex({ "email": 1 }, { unique: true });
db.users.createIndex({ "provider": 1, "providerId": 1 }, { unique: true });

db.api_keys.createIndex({ "userId": 1 });
db.api_keys.createIndex({ "userId": 1, "provider": 1 });

db.endpoints.createIndex({ "userId": 1 });
db.endpoints.createIndex({ "userId": 1, "isActive": 1 });

db.model_mappings.createIndex({ "userId": 1 });
db.model_mappings.createIndex({ "userId": 1, "isDefault": 1 });

db.request_logs.createIndex({ "userId": 1, "createdAt": -1 });
db.request_logs.createIndex({ "createdAt": -1 });
db.request_logs.createIndex({ "statusCode": 1 });
db.request_logs.createIndex({ "claudeModelId": 1 });

// TTL index for request logs (optional - keep 90 days)
// db.request_logs.createIndex({ "createdAt": 1 }, { expireAfterSeconds: 7776000 });

print('MongoDB initialized for Model Translation Gateway');