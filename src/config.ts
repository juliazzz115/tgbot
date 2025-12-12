import * as dotenv from 'dotenv';

dotenv.config();

export const config = {
  botToken: process.env.BOT_TOKEN || '',
  operatorIds: (process.env.OPERATOR_IDS || '')
    .split(',')
    .map(id => id.trim())
    .filter(id => id)
    .map(id => BigInt(id)),
  adminId: process.env.ADMIN_ID ? BigInt(process.env.ADMIN_ID) : null,
  maxChatsPerOperator: parseInt(process.env.MAX_CHATS_PER_OPERATOR || '5', 10),
};

// Validation
if (!config.botToken) {
  throw new Error('BOT_TOKEN is required in .env file');
}

if (config.operatorIds.length === 0) {
  console.warn('Warning: No operator IDs configured. Add OPERATOR_IDS to .env file');
}
