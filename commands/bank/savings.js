const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('savings')
    .setNameLocalizations({
      ar: 'توفير'
    })
    .setDescription('Manage your savings account')
    .setDescriptionLocalizations({
      ar: 'إدارة حساب التوفير الخاص بك'
    })
    .addSubcommand(subcommand =>
      subcommand
        .setName('transfer')
        .setNameLocalizations({ ar: 'تحويل' })
        .setDescription('Transfer money to savings')
        .setDescriptionLocalizations({ ar: 'تحويل أموال إلى التوفير' })
        .addNumberOption(option =>
          option
            .setName('amount')
            .setNameLocalizations({ ar: 'المبلغ' })
            .setDescription('Amount to transfer')
            .setDescriptionLocalizations({ ar: 'مبلغ التحويل' })
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('withdraw')
        .setNameLocalizations({ ar: 'سحب' })
        .setDescription('Withdraw from savings')
        .setDescriptionLocalizations({ ar: 'سحب من التوفير' })
        .addNumberOption(option =>
          option
            .setName('amount')
            .setNameLocalizations({ ar: 'المبلغ' })
            .setDescription('Amount to withdraw')
            .setDescriptionLocalizations({ ar: 'مبلغ السحب' })
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('balance')
        .setNameLocalizations({ ar: 'الرصيد' })
        .setDescription('Check your savings balance')
        .setDescriptionLocalizations({ ar: 'تحقق من رصيد التوفير الخاص بك' })
    ),

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

      const subcommand = interaction.options.getSubcommand();

      if (subcommand === 'transfer') {
        const amount = interaction.options.getNumber('amount');

        if (user.checkingBalance < amount) {
          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ رصيد غير كافي')
            .setDescription(`الرصيد المتاح: ${user.checkingBalance} عملة\nالمطلوب: ${amount} عملة`);
          return interaction.editReply({ embeds: [embed] });
        }

        user.checkingBalance -= amount;
        user.savingsBalance += amount;

        await user.addTransaction({
          type: 'transfer',
          amount: amount,
          from: 'Checking',
          to: 'Savings',
          description: 'تحويل إلى حساب التوفير'
        });

        const embed = new EmbedBuilder()
          .setColor('#4ECDC4')
          .setTitle('✅ تم التحويل بنجاح')
          .addFields(
            { name: 'المبلغ المحول', value: `💰 ${amount} عملة`, inline: true },
            { name: 'رصيد الجاري الجديد', value: `💳 ${user.checkingBalance} عملة`, inline: true },
            { name: 'رصيد التوفير الجديد', value: `🏦 ${user.savingsBalance} عملة`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'withdraw') {
        const amount = interaction.options.getNumber('amount');

        if (user.savingsBalance < amount) {
          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ رصيد توفير غير كافي')
            .setDescription(`الرصيد المتاح: ${user.savingsBalance} عملة\nالمطلوب: ${amount} عملة`);
          return interaction.editReply({ embeds: [embed] });
        }

        user.savingsBalance -= amount;
        user.checkingBalance += amount;

        await user.addTransaction({
          type: 'withdrawal',
          amount: amount,
          from: 'Savings',
          to: 'Checking',
          description: 'سحب من حساب التوفير'
        });

        const embed = new EmbedBuilder()
          .setColor('#4ECDC4')
          .setTitle('✅ تم السحب بنجاح')
          .addFields(
            { name: 'المبلغ المسحوب', value: `💰 ${amount} عملة`, inline: true },
            { name: 'رصيد التوفير الجديد', value: `🏦 ${user.savingsBalance} عملة`, inline: true },
            { name: 'رصيد الجاري الجديد', value: `💳 ${user.checkingBalance} عملة`, inline: true }
          )
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'balance') {
        const interestRate = (user.interestRate * 100).toFixed(2);
        const estimatedMonthlyInterest = (user.savingsBalance * user.interestRate).toFixed(2);

        const embed = new EmbedBuilder()
          .setColor('#4ECDC4')
          .setTitle('💼 حساب التوفير الخاص بك')
          .addFields(
            { name: 'رصيد التوفير', value: `🏦 ${user.savingsBalance} عملة`, inline: true },
            { name: 'رصيد الجاري', value: `💳 ${user.checkingBalance} عملة`, inline: true },
            { name: 'الرصيد الإجمالي', value: `💰 ${user.getTotalBalance()} عملة`, inline: true },
            { name: 'معدل الفائدة الشهري', value: `📊 ${interestRate}%`, inline: true },
            { name: 'الفائدة المتوقعة شهرياً', value: `💵 ${estimatedMonthlyInterest} عملة`, inline: true },
            { name: 'تاريخ الفائدة الأخيرة', value: user.lastInterestDate ? `📅 ${user.lastInterestDate.toLocaleDateString('ar-SA')}` : 'لم تُحسب بعد', inline: true }
          )
          .setFooter({ text: 'الفائدة تُحسب تلقائياً يومياً' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      }
    } catch (error) {
      console.error('Error in savings command:', error);
      interaction.editReply({ content: '❌ حدث خطأ أثناء معالجة طلبك' });
    }
  }
};
