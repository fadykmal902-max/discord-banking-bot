const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['deposit', 'withdrawal', 'transfer', 'interest', 'tax', 'overdraft', 'repayment'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  from: String,
  to: String,
  description: String,
  timestamp: {
    type: Date,
    default: Date.now
  },
  isAnonymous: {
    type: Boolean,
    default: false
  }
});

const scheduledTransferSchema = new mongoose.Schema({
  recipientId: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  frequency: {
    type: String,
    enum: ['weekly', 'daily', 'monthly'],
    default: 'weekly'
  },
  nextPaymentDate: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const cardSchema = new mongoose.Schema({
  tier: {
    type: String,
    enum: ['Classic', 'Platinum', 'VIP'],
    default: 'Classic'
  },
  withdrawalLimit: {
    type: Number,
    required: true
  },
  transactionsCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  cardNumber: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const userSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  guildId: {
    type: String,
    required: true,
    index: true
  },
  username: String,
  
  // Account Information
  iban: {
    type: String,
    unique: true,
    sparse: true
  },
  accountCreatedAt: {
    type: Date,
    default: Date.now
  },
  
  // Balance Information
  checkingBalance: {
    type: Number,
    default: 0
  },
  savingsBalance: {
    type: Number,
    default: 0
  },
  overdraftBalance: {
    type: Number,
    default: 0
  },
  overdraftActive: {
    type: Boolean,
    default: false
  },
  
  // Interest & Savings
  lastInterestDate: Date,
  interestRate: {
    type: Number,
    default: 0.05 // 5% monthly
  },
  
  // Card System
  card: cardSchema,
  
  // Scheduled Transfers
  scheduledTransfers: [scheduledTransferSchema],
  
  // Transaction History
  transactions: [transactionSchema],
  
  // Statistics
  totalDeposited: {
    type: Number,
    default: 0
  },
  totalWithdrawn: {
    type: Number,
    default: 0
  },
  totalTransferred: {
    type: Number,
    default: 0
  },
  
  // Flags
  registeredAt: {
    type: Date,
    default: Date.now
  },
  lastDailyReward: Date,
  
  metadata: {
    theme: String,
    language: {
      type: String,
      default: 'ar'
    }
  }
});

// Generate IBAN on save if not exists
userSchema.pre('save', async function(next) {
  if (!this.iban) {
    const generateIBAN = () => {
      const countryCode = 'AE'; // United Arab Emirates
      const bankCode = '0001';
      const checkDigits = String(Math.floor(Math.random() * 100)).padStart(2, '0');
      const accountNumber = String(this.userId).slice(-15).padStart(15, '0');
      return `${countryCode}${checkDigits}${bankCode}${accountNumber}`;
    };
    
    let iban = generateIBAN();
    let exists = await mongoose.model('User').findOne({ iban });
    
    while (exists) {
      iban = generateIBAN();
      exists = await mongoose.model('User').findOne({ iban });
    }
    
    this.iban = iban;
  }
  
  // Initialize card if not exists
  if (!this.card) {
    this.card = {
      tier: 'Classic',
      withdrawalLimit: 10000,
      transactionsCount: 0,
      isActive: true
    };
  }
  
  next();
});

// Add transaction method
userSchema.methods.addTransaction = function(transaction) {
  this.transactions.push(transaction);
  if (this.transactions.length > 100) {
    this.transactions.shift(); // Keep only last 100 transactions
  }
  return this.save();
};

// Get last N transactions
userSchema.methods.getRecentTransactions = function(limit = 5) {
  return this.transactions.slice(-limit).reverse();
};

// Calculate total balance
userSchema.methods.getTotalBalance = function() {
  return this.checkingBalance + this.savingsBalance;
};

module.exports = mongoose.model('User', userSchema);
