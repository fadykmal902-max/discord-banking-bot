const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const User = require('../../models/User');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('overdraft')
    .setNameLocalizations({
      ar: 'سحب_مكشوف'
    })
    .setDescription('Manage your emergency overdraft account')
    .setDescriptionLocalizations({
      ar: 'إدارة حساب السحب المكشوف الطارئ'
    })
    .addSubcommand(subcommand =>
      subcommand
        .setName('withdraw')
        .setNameLocalizations({ ar: 'سحب' })
        .setDescription('Withdraw using overdraft when balance is zero')
        .setDescriptionLocalizations({ ar: 'السحب باستخدام السحب المكشوف عندما يصل الرصيد إلى صفر' })
        .addNumberOption(option =>
          option
            .setName('amount')
            .setNameLocalizations({ ar: 'المبلغ' })
            .setDescription('Amount to overdraft (max 500 coins)')
            .setDescriptionLocalizations({ ar: 'مبلغ السحب المكشوف (الحد الأقصى 500 عملة)' })
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(500)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('repay')
        .setNameLocalizations({ ar: 'سداد' })
        .setDescription('Repay your overdraft debt')
        .setDescriptionLocalizations({ ar: 'سداد ديون السحب المكشوف' })
        .addNumberOption(option =>
          option
            .setName('amount')
            .setNameLocalizations({ ar: 'المبلغ' })
            .setDescription('Amount to repay')
            .setDescriptionLocalizations({ ar: 'مبلغ السداد' })
            .setRequired(true)
            .setMinValue(1)
        )
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('status')
        .setNameLocalizations({ ar: 'الحالة' })
        .setDescription('Check your overdraft status and credit limits')
        .setDescriptionLocalizations({ ar: 'تحقق من حالة السحب المكشوف والحدود الائتمانية' })
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('limits')
        .setNameLocalizations({ ar: 'الحدود' })
        .setDescription('View your credit limits based on card tier')
        .setDescriptionLocalizations({ ar: 'عرض حدودك الائتمانية بناءً على نوع البطاقة' })
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

      // Define overdraft limits by card tier
      const overdraftLimits = {
        'Classic': {
          limit: 500,
          interestRate: 5,
          repaymentDays: 7
        },
        'Platinum': {
          limit: 2000,
          interestRate: 3,
          repaymentDays: 14
        },
        'VIP': {
          limit: 5000,
          interestRate: 1,
          repaymentDays: 30
        }
      };

      const cardTier = user.card.tier;
      const tierLimits = overdraftLimits[cardTier];

      if (subcommand === 'withdraw') {
        const amount = interaction.options.getNumber('amount');

        // Check if overdraft is already active
        if (user.overdraftActive) {
          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ سحب مكشوف نشط بالفعل')
            .addFields(
              { name: 'المبلغ المسحوب حالياً', value: `💰 ${user.overdraftBalance} عملة`, inline: true },
              { name: 'الحد الأقصى المسموح', value: `📊 ${tierLimits.limit} عملة`, inline: true },
              { name: '⚠️ ملاحظة', value: 'قم بسداد الدين الحالي أولاً قبل السحب مرة أخرى', inline: false }
            );
          return interaction.editReply({ embeds: [embed] });
        }

        // Check if balance is zero or negative
        if (user.checkingBalance > 0) {
          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ لديك رصيد كافي')
            .addFields(
              { name: 'رصيدك الحالي', value: `💳 ${user.checkingBalance} عملة`, inline: true },
              { name: '📌 ملاحظة', value: 'السحب المكشوف متاح فقط عندما يصل رصيدك إلى صفر أو أقل', inline: false }
            );
          return interaction.editReply({ embeds: [embed] });
        }

        // Check if amount exceeds limit
        if (amount > tierLimits.limit) {
          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ تجاوز الحد الائتماني المسموح')
            .addFields(
              { name: 'المبلغ المطلوب', value: `💰 ${amount} عملة`, inline: true },
              { name: 'الحد الأقصى المسموح', value: `📊 ${tierLimits.limit} عملة`, inline: true },
              { name: 'نوع البطاقة', value: `🎯 ${cardTier}`, inline: true }
            );
          return interaction.editReply({ embeds: [embed] });
        }

        // Calculate interest for repayment
        const interest = Math.ceil(amount * (tierLimits.interestRate / 100));
        const totalDebt = amount + interest;

        user.overdraftActive = true;
        user.overdraftBalance = totalDebt;
        user.checkingBalance += amount;

        await user.addTransaction({
          type: 'overdraft',
          amount: amount,
          description: `سحب مكشوف طارئ (الفائدة: ${interest} عملة، المجموع: ${totalDebt} عملة)`
        });

        await user.save();

        const embed = new EmbedBuilder()
          .setColor('#FFD93D')
          .setTitle('⚠️ تم منح السحب المكشوف')
          .addFields(
            { name: '💰 المبلغ الممنوح', value: `${amount} عملة`, inline: true },
            { name: '📊 الفائدة المستحقة', value: `${interest} عملة (${tierLimits.interestRate}%)`, inline: true },
            { name: '💳 إجمالي الدين', value: `${totalDebt} عملة`, inline: true },
            { name: '💵 رصيدك الحالي', value: `${user.checkingBalance} عملة`, inline: false },
            { name: '⏰ مدة السداد', value: `${tierLimits.repaymentDays} يوم`, inline: true },
            { name: '🎯 نوع البطاقة', value: cardTier, inline: true },
            { name: '🚨 تذكير مهم', value: 'يجب سداد هذا الدين خلال المدة المحددة، أو سيتم خصمه من الراتب التالي تلقائياً', inline: false }
          )
          .setFooter({ text: 'استخدم `/سحب_مكشوف سداد` لسداد ديونك' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'repay') {
        const amount = interaction.options.getNumber('amount');

        // Check if there's an active overdraft
        if (!user.overdraftActive) {
          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ لا يوجد سحب مكشوف نشط')
            .setDescription('ليس لديك دين سحب مكشوف لتسديده');
          return interaction.editReply({ embeds: [embed] });
        }

        // Check if balance is sufficient
        if (user.checkingBalance < amount) {
          const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ رصيد غير كافي')
            .addFields(
              { name: 'الرصيد المتاح', value: `💳 ${user.checkingBalance} عملة`, inline: true },
              { name: 'المطلوب للسداد', value: `💰 ${amount} عملة`, inline: true }
            );
          return interaction.editReply({ embeds: [embed] });
        }

        // Process repayment
        user.checkingBalance -= amount;
        user.overdraftBalance -= amount;

        const previousDebt = user.overdraftBalance + amount;

        await user.addTransaction({
          type: 'repayment',
          amount: amount,
          description: `سداد جزئي من السحب المكشوف`
        });

        // Check if debt is fully paid
        const isFullyPaid = user.overdraftBalance <= 0;

        if (isFullyPaid) {
          user.overdraftBalance = 0;
          user.overdraftActive = false;
        }

        await user.save();

        const embed = new EmbedBuilder()
          .setColor('#4ECDC4')
          .setTitle('✅ تم السداد بنجاح')
          .addFields(
            { name: '💰 المبلغ المسدد', value: `${amount} عملة`, inline: true },
            { name: '💳 الدين السابق', value: `${previousDebt} عملة`, inline: true },
            { name: '📊 الدين المتبقي', value: `${user.overdraftBalance} عملة`, inline: true },
            { name: '💵 رصيدك الجديد', value: `${user.checkingBalance} عملة`, inline: true }
          );

        if (isFullyPaid) {
          embed.addFields({
            name: '🎉 تم إلغاء السحب المكشوف',
            value: 'لقد قمت بسداد كامل الدين! تم إلغاء السحب المكشوف من حسابك',
            inline: false
          });
        } else {
          embed.addFields({
            name: '⏰ مدة السداد المتبقية',
            value: `${tierLimits.repaymentDays} يوم من تفعيل السحب المكشوف`,
            inline: false
          });
        }

        embed.setFooter({ text: 'استخدم `/سحب_مكشوف الحالة` لعرض حالتك' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'status') {
        const embed = new EmbedBuilder()
          .setColor(user.overdraftActive ? '#FFD93D' : '#4ECDC4')
          .setTitle('📊 حالة السحب المكشوف')
          .addFields(
            { name: '🎯 نوع البطاقة', value: cardTier, inline: true },
            { name: '📍 حالة السحب المكشوف', value: user.overdraftActive ? '⚠️ نشط' : '✅ غير نشط', inline: true },
            { name: '💳 الرصيد الحالي', value: `${user.checkingBalance} عملة`, inline: true },
            { name: '💰 الدين المستحق', value: `${user.overdraftBalance} عملة`, inline: true },
            { name: '📊 الحد الائتماني المسموح', value: `${tierLimits.limit} عملة`, inline: true },
            { name: '📈 معدل الفائدة', value: `${tierLimits.interestRate}%`, inline: true }
          );

        if (user.overdraftActive) {
          embed.addFields({
            name: '⏰ مدة السداد المتبقية',
            value: `${tierLimits.repaymentDays} يوم`,
            inline: true
          });
          embed.addFields({
            name: '🚨 تنبيه',
            value: 'لديك دين نشط يجب سداده قبل انتهاء المدة المحددة',
            inline: false
          });
        }

        embed.setFooter({ text: 'استخدم `/سحب_مكشوف سحب` للسحب أو `/سحب_مكشوف سداد` للسداد' })
          .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
      } else if (subcommand === 'limits') {
        const limitsEmbed = new EmbedBuilder()
          .setColor('#4ECDC4')
          .setTitle('💳 الحدود الائتمانية حسب نوع البطاقة')
          .setDescription('معلومات كاملة عن حدود السحب المكشوف لكل نوع بطاقة');

        // Add information for each tier
        const tiers = ['Classic', 'Platinum', 'VIP'];
        tiers.forEach(tier => {
          const limits = overdraftLimits[tier];
          const isCurrentTier = tier === cardTier;
          const emoji = isCurrentTier ? '✅' : '📍';

          limitsEmbed.addFields({
            name: `${emoji} ${tier === 'VIP' ? '👑' : tier === 'Platinum' ? '💎' : '🎯'} ${tier}`,
            value: `**الحد الائتماني:** ${limits.limit} عملة\n**معدل الفائدة:** ${limits.interestRate}%\n**مدة السداد:** ${limits.repaymentDays} يوم${isCurrentTier ? '\n🔹 بطاقتك الحالية' : ''}`,
            inline: false
          });
        });

        limitsEmbed.addFields({
          name: '📌 معلومات مهمة',
          value: `
• السحب المكشوف متاح فقط عندما يكون رصيدك صفر أو أقل
• يجب سداد الدين خلال المدة المحددة
• الفائدة تُحسب تلقائياً عند تفعيل السحب
• عدم السداد في الوقت المحدد سيؤثر على حسابك
• يمكنك ترقية بطاقتك للحصول على حدود أعلى
          `,
          inline: false
        });

        limitsEmbed.setFooter({ text: 'للحصول على حد أعلى، قم بترقية بطاقتك!' })
          .setTimestamp();

        await interaction.editReply({ embeds: [limitsEmbed] });
      }
    } catch (error) {
      console.error('Error in overdraft command:', error);
      interaction.editReply({ content: '❌ حدث خطأ أثناء معالجة طلبك' });
    }
  }
};
