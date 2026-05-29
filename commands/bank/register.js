const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('register')
    .setNameLocalizations({
      ar: 'تسجيل'
    })
    .setDescription('Create your bank account')
    .setDescriptionLocalizations({
      ar: 'إنشاء حسابك البنكي'
    }),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const existingUser = await User.findOne({
        userId: interaction.user.id,
        guildId: interaction.guildId
      });

      if (existingUser) {
        const embed = new EmbedBuilder()
          .setColor('#FF6B6B')
          .setTitle('❌ حساب موجود بالفعل')
          .setDescription(`أنت بالفعل مسجل في النظام البنكي\n**IBAN:** \`${existingUser.iban}\``);
        return interaction.editReply({ embeds: [embed] });
      }

      const newUser = new User({
        userId: interaction.user.id,
        guildId: interaction.guildId,
        username: interaction.user.username,
        checkingBalance: 1000,
        savingsBalance: 0
      });

      await newUser.save();

      const embed = new EmbedBuilder()
        .setColor('#4ECDC4')
        .setTitle('✅ تم إنشاء حسابك بنجاح')
        .addFields(
          { name: 'رقم الحساب الدولي (IBAN)', value: `\`${newUser.iban}\``, inline: false },
          { name: 'الرصيد الأولي', value: `💰 ${newUser.checkingBalance} عملة`, inline: false },
          { name: 'نوع البطاقة', value: `🎯 ${newUser.card.tier}`, inline: false },
          { name: 'حد السحب الأقصى', value: `💳 ${newUser.card.withdrawalLimit} عملة`, inline: false }
        )
        .setFooter({ text: 'مرحباً بك في نظام البنك المتقدم 2.0' })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in register command:', error);
      interaction.editReply({ content: '❌ حدث خطأ أثناء إنشاء الحساب' });
    }
  }
};
