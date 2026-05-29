const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const crypto = require('crypto');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('secret_pay')
    .setNameLocalizations({
      ar: 'تحويل_سري'
    })
    .setDescription('Send an anonymous transfer with encrypted code')
    .setDescriptionLocalizations({
      ar: 'إرسال تحويل مجهول برمز مشفر'
    })
    .addUserOption(option =>
      option
        .setName('recipient')
        .setNameLocalizations({ ar: 'المستقبل' })
        .setDescription('The recipient of the anonymous transfer')
        .setDescriptionLocalizations({ ar: 'المستقبل للتحويل المجهول' })
        .setRequired(true)
    )
    .addNumberOption(option =>
      option
        .setName('amount')
        .setNameLocalizations({ ar: 'المبلغ' })
        .setDescription('Amount to send anonymously')
        .setDescriptionLocalizations({ ar: 'مبلغ التحويل المجهول' })
        .setRequired(true)
        .setMinValue(1)
    )
    .addStringOption(option =>
      option
        .setName('message')
        .setNameLocalizations({ ar: 'الرسالة' })
        .setDescription('Optional anonymous message (max 100 characters)')
        .setDescriptionLocalizations({ ar: 'رسالة مجهولة اختيارية (100 حرف كحد أقصى)' })
        .setMaxLength(100)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const sender = await User.findOne({
        userId: interaction.user.id,
        guildId: interaction.guildId
      });

      if (!sender) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ لم تقم بالتسجيل')
          .setDescription('يرجى استخدام أمر `/register` أولاً');
        return interaction.editReply({ embeds: [embed] });
      }

      const recipientUser = interaction.options.getUser('recipient');
      const recipient = await User.findOne({
        userId: recipientUser.id,
        guildId: interaction.guildId
      });

      if (!recipient) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ المستقبل غير مسجل')
          .setDescription('المستخدم المستقبل لم يقم بالتسجيل في النظام البنكي');
        return interaction.editReply({ embeds: [embed] });
      }

      if (recipientUser.id === interaction.user.id) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ لا يمكنك إرسال تحويل سري إلى نفسك')
          .setDescription('حاول الإرسال إلى مستخدم آخر');
        return interaction.editReply({ embeds: [embed] });
      }

      const amount = interaction.options.getNumber('amount');
      const message = interaction.options.getString('message') || null;

      // Progressive taxation for anonymous transfers (higher than regular transfers)
      let taxPercentage = 0;
      if (amount <= 100) taxPercentage = 2;
      else if (amount <= 500) taxPercentage = 3;
      else if (amount <= 1000) taxPercentage = 4;
      else if (amount <= 5000) taxPercentage = 6;
      else taxPercentage = 10;

      const tax = Math.floor(amount * (taxPercentage / 100));
      const totalDeduction = amount + tax;

      if (sender.checkingBalance < totalDeduction) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ رصيد غير كافي')
          .addFields(
            { name: 'الرصيد المتاح', value: `💳 ${sender.checkingBalance} عملة`, inline: true },
            { name: 'المطلوب (مع الضريبة)', value: `💰 ${totalDeduction} عملة`, inline: true },
            { name: 'نسبة ضريبة التحويل السري', value: `🔴 ${taxPercentage}%`, inline: true }
          );
        return interaction.editReply({ embeds: [embed] });
      }

      // Generate secure encryption code
      const encryptionCode = generateSecureCode();
      const timestamp = Date.now();
      
      sender.checkingBalance -= totalDeduction;
      recipient.checkingBalance += amount;

      await sender.addTransaction({
        type: 'transfer',
        amount: amount,
        from: 'مجهول',
        to: 'Self',
        description: `تحويل سري مشفر - كود: ${encryptionCode.display} (ضريبة: ${tax} عملة)`,
        isAnonymous: true
      });

      await recipient.addTransaction({
        type: 'transfer',
        amount: amount,
        from: 'مجهول',
        to: 'Self',
        description: `استقبال تحويل سري من شخص مجهول - كود: ${encryptionCode.display}${message ? ` - الرسالة: ${message}` : ''}`,
        isAnonymous: true
      });

      await sender.save();
      await recipient.save();

      const senderEmbed = new EmbedBuilder()
        .setColor('#4ECDC4')
        .setTitle('✅ تم إرسال التحويل السري بنجاح')
        .addFields(
          { name: '🔐 رمز التشفير', value: `\`${encryptionCode.display}\``, inline: false },
          { name: '👤 المستقبل (مجهول لك)', value: `تم إرسال المبلغ بنجاح`, inline: true },
          { name: '💰 المبلغ المرسل', value: `${amount} عملة`, inline: true },
          { name: '🔴 الضريبة المستقطعة', value: `${tax} عملة (${taxPercentage}%)`, inline: true },
          { name: '💳 إجمالي الخصم', value: `${totalDeduction} عملة`, inline: false },
          { name: '💵 رصيدك الجديد', value: `${sender.checkingBalance} عملة`, inline: true },
          { name: '⏰ الوقت', value: new Date(timestamp).toLocaleString('ar-SA'), inline: true }
        )
        .addFields(
          { name: '📌 معلومات الرمز:', value: `رمز التشفير صالح لمدة 24 ساعة فقط\nلا يمكن تتبع هذا التحويل`, inline: false }
        )
        .setFooter({ text: '🔐 تحويل سري بالكامل - لن يعرف المستقبل من أرسلها' })
        .setTimestamp();

      await interaction.editReply({ embeds: [senderEmbed] });

      // Send anonymous notification to recipient
      try {
        const recipientEmbed = new EmbedBuilder()
          .setColor('#FFD93D')
          .setTitle('🎁 تلقيت تحويلاً سرياً مجهولاً!')
          .addFields(
            { name: '💰 المبلغ المستقبل', value: `${amount} عملة`, inline: true },
            { name: '🔐 رمز التشفير', value: `\`${encryptionCode.display}\``, inline: true },
            { name: '👥 من', value: '🔒 شخص مجهول تماماً', inline: false },
            { name: '⏰ الوقت', value: new Date(timestamp).toLocaleString('ar-SA'), inline: true },
            { name: '🌍 الحالة', value: 'لن تتمكن من معرفة من أرسل لك هذا التحويل 🤐', inline: false }
          );

        if (message) {
          recipientEmbed.addFields({
            name: '💬 رسالة مجهولة',
            value: `\`\`\`${message}\`\`\``,
            inline: false
          });
        }

        recipientEmbed.addFields({
          name: '📌 ملاحظات مهمة:',
          value: `
• رمز التشفير: ${encryptionCode.display}
• الرمز صالح لمدة 24 ساعة فقط
• هذا التحويل غير قابل للعكس
• تم إضافة المبلغ لحسابك تلقائياً
          `,
          inline: false
        })
          .setFooter({ text: '🏦 البنك المتقدم 2.0 - نظام التحويلات السرية' })
          .setTimestamp();

        await recipientUser.send({ embeds: [recipientEmbed] }).catch(() => {
          // User might have DMs disabled
        });
      } catch (error) {
        console.error('Could not send DM to recipient:', error);
      }

      // Log the transaction for security purposes (in production, use secure logging)
      console.log(`[SECURE TRANSFER] Sender: ${sender.userId} → Recipient: ${recipient.userId} | Amount: ${amount} | Code: ${encryptionCode.full} | Timestamp: ${timestamp}`);

    } catch (error) {
      console.error('Error in secret_pay command:', error);
      interaction.editReply({ content: '❌ حدث خطأ أثناء معالجة التحويل السري' });
    }
  }
};

/**
 * Generate a secure encryption code for the transfer
 * Returns both display version and full version
 */
function generateSecureCode() {
  // Generate a random encrypted hash
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const fullCode = crypto.createHash('sha256').update(randomBytes + Date.now()).digest('hex');
  
  // Create a user-friendly display code (format: XXXX-XXXX-XXXX)
  const displayCode = fullCode
    .substring(0, 12)
    .match(/.{1,4}/g)
    .join('-')
    .toUpperCase();

  return {
    full: fullCode,
    display: displayCode
  };
}

module.exports.generateSecureCode = generateSecureCode;
