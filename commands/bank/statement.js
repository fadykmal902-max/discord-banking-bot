const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('statement')
    .setNameLocalizations({
      ar: 'كشف_حساب'
    })
    .setDescription('View your last 5 transactions and account summary')
    .setDescriptionLocalizations({
      ar: 'عرض آخر 5 عمليات وملخص حسابك'
    }),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const user = await User.findOne({
        userId: interaction.user.id,
        guildId: interaction.guildId
      });

      if (!user) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ لم تقم بالتسجيل')
          .setDescription('يرجى استخدام أمر `/register` أولاً');
        return interaction.editReply({ embeds: [embed] });
      }

      const recentTransactions = user.getRecentTransactions(5);

      // Main statement header embed
      const headerEmbed = new EmbedBuilder()
        .setColor('#4ECDC4')
        .setTitle('📋 كشف الحساب البنكي')
        .setDescription(`**حامل الحساب:** ${interaction.user.username}\n**IBAN:** \`${user.iban}\`\n**التاريخ:** ${new Date().toLocaleDateString('ar-SA')}`)
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: 'البنك المتقدم 2.0' })
        .setTimestamp();

      // Account balance summary embed
      const balanceSummaryEmbed = new EmbedBuilder()
        .setColor('#4ECDC4')
        .setTitle('💼 ملخص الحساب')
        .addFields(
          { name: 'رصيد الجاري', value: `💳 ${user.checkingBalance} عملة`, inline: true },
          { name: 'رصيد التوفير', value: `🏦 ${user.savingsBalance} عملة`, inline: true },
          { name: 'الرصيد الإجمالي', value: `💰 ${user.getTotalBalance()} عملة`, inline: true },
          { name: 'الحد الأقصى للسحب', value: `📊 ${user.card.withdrawalLimit} عملة`, inline: true },
          { name: 'عدد العمليات', value: `🔢 ${user.card.transactionsCount}`, inline: true },
          { name: 'حالة البطاقة', value: user.card.isActive ? '✅ نشطة' : '❌ معطلة', inline: true }
        );

      if (user.overdraftActive) {
        balanceSummaryEmbed.addFields({
          name: '⚠️ السحب الطارئ',
          value: `المبلغ المسحوب: ${user.overdraftBalance} عملة`,
          inline: false
        });
      }

      // Card tier details embed
      const cardTierEmoji = {
        'Classic': '🎯',
        'Platinum': '💎',
        'VIP': '👑'
      };

      const cardTierBenefits = {
        'Classic': {
          features: [
            '💳 بطاقة أساسية للمبتدئين',
            '📊 حد سحب: 10,000 عملة',
            '📈 فائدة شهرية: 5%',
            '🔄 تحويلات محدودة'
          ],
          requirements: 'بدون متطلبات'
        },
        'Platinum': {
          features: [
            '💎 بطاقة مميزة',
            '📊 حد سحب: 50,000 عملة',
            '📈 فائدة شهرية: 7%',
            '🔄 تحويلات غير محدودة',
            '💰 مكافآت إضافية'
          ],
          requirements: '500+ عملية أو 100,000 عملة إجمالي'
        },
        'VIP': {
          features: [
            '👑 بطاقة VIP حصرية',
            '📊 حد سحب: 200,000 عملة',
            '📈 فائدة شهرية: 10%',
            '🔄 تحويلات فورية',
            '💰 مكافآت عالية',
            '🎁 امتيازات خاصة',
            '🏆 أولوية في الخدمات'
          ],
          requirements: '2000+ عملية أو 1,000,000 عملة إجمالي'
        }
      };

      const currentTier = user.card.tier;
      const tierInfo = cardTierBenefits[currentTier];

      const cardEmbed = new EmbedBuilder()
        .setColor(currentTier === 'VIP' ? '#FFD700' : currentTier === 'Platinum' ? '#C0C0C0' : '#CD7F32')
        .setTitle(`${cardTierEmoji[currentTier]} تفاصيل بطاقتك - ${currentTier}`)
        .addFields(
          { name: '📋 المميزات:', value: tierInfo.features.join('\n'), inline: false },
          { name: '📌 المتطلبات للترقية:', value: tierInfo.requirements, inline: false },
          { name: '⏰ تاريخ الإنشاء', value: user.card.createdAt ? user.card.createdAt.toLocaleDateString('ar-SA') : 'غير محدد', inline: true },
          { name: '🔐 حالة البطاقة', value: user.card.isActive ? '✅ نشطة' : '❌ معطلة', inline: true }
        );

      // Upgrade recommendation
      if (currentTier === 'Classic') {
        cardEmbed.addFields({
          name: '🚀 نصيحة للترقية',
          value: `قم بـ 500 عملية أوجمّع 100,000 عملة للحصول على بطاقة Platinum!`,
          inline: false
        });
      } else if (currentTier === 'Platinum') {
        cardEmbed.addFields({
          name: '🚀 نصيحة للترقية',
          value: `قم بـ 2000 عملية أو جمّع 1,000,000 عملة للحصول على بطاقة VIP!`,
          inline: false
        });
      }

      // Transactions embed
      let transactionsEmbed = new EmbedBuilder()
        .setColor('#4ECDC4')
        .setTitle('📊 آخر 5 عمليات');

      if (recentTransactions.length === 0) {
        transactionsEmbed.setDescription('لا توجد معاملات سابقة');
      } else {
        const typeEmoji = {
          'deposit': '📥',
          'withdrawal': '📤',
          'transfer': '💸',
          'interest': '💰',
          'tax': '🔴',
          'overdraft': '⚠️',
          'repayment': '✅'
        };

        const typeLabel = {
          'deposit': 'إيداع',
          'withdrawal': 'سحب',
          'transfer': 'تحويل',
          'interest': 'فائدة',
          'tax': 'ضريبة',
          'overdraft': 'سحب طارئ',
          'repayment': 'سداد'
        };

        recentTransactions.forEach((transaction, index) => {
          const transactionDetails = `${typeEmoji[transaction.type] || '📊'} **${typeLabel[transaction.type] || 'عملية'}**
**المبلغ:** ${transaction.amount} عملة
**الوصف:** ${transaction.description || 'بدون تفاصيل'}
**الوقت:** ${transaction.timestamp.toLocaleString('ar-SA')}`;

          transactionsEmbed.addFields({
            name: `العملية #${index + 1}`,
            value: transactionDetails,
            inline: false
          });
        });
      }

      // Statistics embed
      const statsEmbed = new EmbedBuilder()
        .setColor('#4ECDC4')
        .setTitle('📈 إحصائيات الحساب')
        .addFields(
          { name: 'إجمالي المودعات', value: `📥 ${user.totalDeposited} عملة`, inline: true },
          { name: 'إجمالي السحوبات', value: `📤 ${user.totalWithdrawn} عملة`, inline: true },
          { name: 'إجمالي التحويلات', value: `💸 ${user.totalTransferred} عملة`, inline: true },
          { name: 'عدد العمليات الكلي', value: `🔢 ${user.transactions.length}`, inline: true },
          { name: 'تاريخ فتح الحساب', value: user.accountCreatedAt ? user.accountCreatedAt.toLocaleDateString('ar-SA') : 'غير محدد', inline: true },
          { name: 'آخر تحديث', value: new Date().toLocaleTimeString('ar-SA'), inline: true }
        );

      await interaction.editReply({
        embeds: [headerEmbed, balanceSummaryEmbed, cardEmbed, transactionsEmbed, statsEmbed]
      });
    } catch (error) {
      console.error('Error in statement command:', error);
      interaction.editReply({ content: '❌ حدث خطأ أثناء عرض كشف الحساب' });
    }
  }
};
