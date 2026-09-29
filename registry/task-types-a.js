/* Task definitions from Products BPM / Задачи, sections 112:16738,
 * 112:16739 and 112:16741. Shared renderer owns Nordic controls and sheets.
 * This is a local prototype: approval records a decision, not real permissions,
 * role assignments or changes to the production process catalogue. */
(() => {
  'use strict';

  const copy = value => JSON.parse(JSON.stringify(value));
  const str = value => String(value ?? '').trim();
  const list = value => Array.isArray(value) ? value : [];
  const terminal = task => ['Завершено', 'Отклонена', 'Отозвана', 'Отменено'].includes(task?.status);
  const option = value => ({value, label: value});
  const commonInitial = () => ({title: '', description: '', deadline: '', processId: '', assignees: []});
  const processOf = (d, ctx) => list(ctx.processes).find(row => String(row.id) === String(d.processId));
  const merged = (task, ctx = {}) => ({...task, ...task?.flowData, ...ctx.draft});
  const processField = d => ({key: 'processId', label: 'Процесс', kind: 'process', required: true, value: d.processId, placeholder: 'Выберите'});
  const deadlineField = d => ({key: 'deadline', label: 'Срок задачи', kind: 'date', required: true, value: d.deadline, placeholder: 'ДД.ММ.ГГГГ'});
  const assigneesField = d => ({key: 'assignees', label: 'Ответственные', kind: 'people', required: true, value: list(d.assignees), placeholder: 'Выберите'});
  const titleField = d => ({key: 'title', label: 'Название', kind: 'text', required: true, value: d.title, placeholder: 'Введите название задачи'});
  const initiatorField = (d, ctx) => ({key: 'initiator', label: 'Инициатор', kind: 'person', value: d.initiator || ctx.task?.initiator || ctx.currentUser || '—'});
  const roleDescription = 'Аналитик процесса отвечает за работу с цифровым мониторингом процесса, анализ сценариев процесса, отклонений и данных Process Mining, а также за подготовку предложений по улучшению процесса на основе выявленных отклонений и аналитических данных.';
  const acknowledgeLabel = 'Я ознакомлен(а) с описанием роли и подтверждаю, что пройду курс обучения в установленный срок.';
  const roles = [{value: 'process-analyst', label: 'Аналитик процесса'}];
  const channels = ['ВСП', 'СберБизнес', 'API'].map(option);
  const services = ['Выполнения должностных обязанностей', 'Выполнения обязанностей'].map(option);
  const segments = ['ВСП'].map(option);
  const descriptions = ['БО1'].map(option);
  const variantPropertyLabels = [
    ['title', 'Название варианта предоставления результата процесса'],
    ['service', 'Услуга'], ['segment', 'Сегмент'],
    ['channel', 'Канал исполнения'], ['businessDescription', 'Бизнес описание']
  ];

  function names(ctx) {
    return [...new Set(list(ctx.people).map(person => typeof person === 'string' ? person : person.name || person.label || person.fullName).filter(Boolean))].map(option);
  }

  function validDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str(value));
    if (!match) return false;
    const [, y, m, day] = match, date = new Date(+y, +m - 1, +day, 12);
    return +y >= 1800 && +y <= 2200 && date.getFullYear() === +y && date.getMonth() === +m - 1 && date.getDate() === +day;
  }

  function validateCommon(d, ctx, {title = true, assignees = true, description = false} = {}) {
    const errors = {};
    if (title && !str(d.title)) errors.title = 'Введите название задачи';
    if (!validDate(d.deadline)) errors.deadline = 'Укажите корректный срок задачи';
    if (!d.processId || !processOf(d, ctx)) errors.processId = 'Выберите процесс';
    if (assignees && !list(d.assignees).filter(str).length) errors.assignees = 'Выберите хотя бы одного ответственного';
    if (description && !str(d.description)) errors.description = 'Укажите обоснование запроса';
    return errors;
  }

  // Real variants are reused when supplied by a process. Existing registry data
  // has no variants yet, so the prototype exposes a small, labelled demo set.
  function existingVariants(d, ctx) {
    const process = processOf(d, ctx);
    if (!process) return [];
    const actual = list(process.variants);
    const source = actual.length ? actual : [
      {title: `${process.title || 'Результат процесса'} — ВСП`, channel: 'ВСП'},
      {title: `${process.title || 'Результат процесса'} — СберБизнес`, channel: 'СберБизнес'},
      {title: `${process.title || 'Результат процесса'} — API`, channel: 'API'}
    ];
    return source.map((value, index) => {
      const item = typeof value === 'string' ? {title: value} : value;
      return {
        ...item, id: String(item.id || `${process.id}:variant:${index + 1}`),
        title: str(item.title || item.name || `Вариант ${index + 1}`),
        service: str(item.service || 'Выполнения должностных обязанностей'),
        segment: str(item.segment || 'ВСП'), channel: str(item.channel || 'ВСП'),
        businessDescription: str(item.businessDescription || 'БО1')
      };
    });
  }

  function selectedVariant(d, ctx) {
    return existingVariants(d, ctx).find(item => item.id === d.selectedVariantId) || null;
  }

  function variantOptions(d, ctx) {
    return existingVariants(d, ctx).map(item => ({value: item.id, label: item.title}));
  }

  function roleVariantField(d, ctx) {
    return {key: 'resultVariant', label: 'Вариант предоставления результата процесса', kind: 'select',
      required: true, disabled: !d.processId, value: d.resultVariant, options: variantOptions(d, ctx),
      placeholder: d.processId ? 'Выберите' : 'Сначала выберите процесс'};
  }

  function readonlyVariant(d, ctx) {
    const label = d.resultVariantTitle || existingVariants(d, ctx).find(item => item.id === d.resultVariant)?.title || d.resultVariant || '—';
    return {key: 'resultVariant', label: 'Вариант предоставления результата процесса', kind: 'readonly', value: label};
  }

  function resubmit(task) {
    return task?.status === 'На доработке' ? [{id: 'resubmit', label: 'На согласование', kind: 'primary', icon: 'tick', nextStatus: 'Создана', immediate: true}] : null;
  }

  function approvalActions(task, {copy: approveCopy, approvePatch, rejectPatch, approveTitle} = {}) {
    if (terminal(task)) return [];
    const repeat = resubmit(task);
    if (repeat) return repeat;
    return [
      {id: 'reject', label: 'Отклонить', kind: 'secondary', icon: 'reject', nextStatus: 'Отклонена',
        sheetTitle: 'Причина отклонения', copy: 'Укажите причину отклонения задачи.', commentRequired: true, confirmLabel: 'Отклонить',
        ...(rejectPatch ? {patch: rejectPatch} : {})},
      {id: 'rework', label: 'На доработку', kind: 'secondary', icon: 'reset', nextStatus: 'На доработке',
        sheetTitle: 'Вернуть на доработку', copy: 'Опишите, что необходимо изменить.', commentRequired: true, confirmLabel: 'На доработку'},
      {id: 'approve', label: 'Согласовать', kind: 'primary', icon: 'tick', nextStatus: 'Завершено',
        sheetTitle: approveTitle || 'Согласование', copy: approveCopy || 'Внесите финальный комментарий по задаче.',
        commentRequired: false, confirmLabel: 'Согласовать', ...(approvePatch ? {patch: approvePatch} : {})}
    ];
  }

  const access = {
    id: 'extended-access', label: 'Согласование расширенного доступа к процессу', tag: 'Доступы', prefix: 'ДОСТ',
    initial: () => commonInitial(),
    fields: d => [titleField(d), deadlineField(d), processField(d),
      {key: 'description', label: 'Обоснование запроса на расширенный доступ', kind: 'textarea', required: true,
        value: d.description, placeholder: 'Введите обоснование запроса'}, assigneesField(d)],
    viewFields: (d, ctx) => [deadlineField(d), initiatorField(d, ctx), processField(d),
      ...(d.resultVariant ? [readonlyVariant(d, ctx)] : []),
      {key: 'description', label: 'Обоснование запроса на расширенный доступ', kind: 'readonly', value: d.description}, assigneesField(d)],
    validate: (d, ctx) => validateCommon(d, ctx, {description: true}),
    actions: task => approvalActions(task, {copy: 'Вы согласовываете расширенный доступ к процессу.\nВнесите финальный комментарий по задаче.',
      approveTitle: 'Согласовать', approvePatch: {accessDecision: 'approved'}, rejectPatch: {accessDecision: 'rejected'}})
  };

  const roleManagement = {
    id: 'role-management', label: 'Управление ролями', tag: 'Роли', prefix: 'РОЛЬ',
    initial: () => ({...commonInitial(), title: 'Управление ролями', roleAction: 'add', resultVariant: '', resultVariantTitle: '', role: '', candidate: '', acknowledged: false, roleDecision: ''}),
    fields: (d, ctx) => [deadlineField(d), processField(d), roleVariantField(d, ctx),
      {key: 'roleAction', label: 'Действие с ролью', kind: 'radio', required: true, value: d.roleAction, inlineLabel: true, hideLabel: true,
        options: [{value: 'add', label: 'Добавить'}, {value: 'remove', label: 'Удалить'}]},
      {key: 'role', label: 'Роль', kind: 'select', required: true, value: d.role, options: roles, placeholder: 'Выберите'},
      ...(d.role ? [{key: 'roleDescription', label: 'Описание роли', kind: 'readonly', value: roleDescription}] : []),
      {key: 'candidate', label: 'ФИО сотрудника', kind: 'select', required: true, value: d.candidate, options: names(ctx), placeholder: 'Выберите'},
      ...(d.candidate ? [{key: 'selectedEmployee', label: '', kind: 'person', value: d.candidate}] : []),
      {key: 'description', label: 'Описание задачи', kind: 'textarea', value: d.description, placeholder: 'Введите описание задачи'}],
    viewFields(d, ctx) {
      const done = terminal(ctx.task || d), remove = d.roleAction === 'remove';
      const fields = [deadlineField(d)];
      if (!done) fields.push({key: 'candidate', label: 'ФИО сотрудника', kind: 'person', value: d.candidate, group: 'participants', columns: 2});
      fields.push({...initiatorField(d, ctx), ...(done ? {} : {group: 'participants'})});
      if (done) fields.push({key: 'assignmentHeading', kind: 'heading', text: `${remove ? 'Удаление с роли' : 'Назначение на роль'} «Аналитик процесса»`,
        group: 'assignment', card: true, tone: d.roleDecision === 'rejected' ? 'danger' : 'success'},
      {key: 'roleDecision', label: 'Решение', kind: 'readonly', value: d.roleDecision === 'rejected' ? 'Отклонено' : 'Принято', group: 'assignment', card: true},
      {key: 'candidate', label: 'ФИО сотрудника', kind: 'person', value: d.candidate, group: 'assignment', card: true});
      const assignmentProps = done ? {group: 'assignment', card: true} : {};
      fields.push({...processField(d), ...assignmentProps}, {...readonlyVariant(d, ctx), ...assignmentProps});
      if (!done) fields.push({key: 'role', label: 'Роль', kind: 'readonly', value: 'Аналитик процесса'});
      fields.push({key: 'roleDescription', label: 'Описание роли', kind: 'readonly', value: roleDescription},
        {key: 'courseLink', label: '', kind: 'readonly', tone: 'link', value: 'Ссылка на курс',
          help: 'Ссылка будет доступна после подключения учебного портала.'},
        {key: 'description', label: 'Описание задачи', kind: 'readonly', value: d.description || '—'});
      if (!remove && (!done || d.roleDecision === 'accepted')) fields.push({key: 'acknowledged', label: acknowledgeLabel,
        kind: 'checkbox', value: Boolean(d.acknowledged), interactive: !done, required: !done});
      return fields;
    },
    validate(d, ctx) {
      const errors = validateCommon(d, ctx, {title: false, assignees: false});
      if (!['add', 'remove'].includes(d.roleAction)) errors.roleAction = 'Выберите действие с ролью';
      if (!roles.some(item => item.value === d.role)) errors.role = 'Выберите роль';
      if (!str(d.candidate)) errors.candidate = 'Выберите сотрудника';
      if (!d.resultVariant || !variantOptions(d, ctx).some(item => item.value === d.resultVariant)) errors.resultVariant = 'Выберите вариант предоставления результата процесса';
      return errors;
    },
    onCreate(d, ctx) {
      const variant = existingVariants(d, ctx).find(item => item.id === d.resultVariant);
      return {title: 'Управление ролями', assignees: [d.candidate], acknowledged: false,
        resultVariantTitle: variant?.title || d.resultVariant, roleDescription, roleDecision: ''};
    },
    actions(task, ctx) {
      if (terminal(task)) return [];
      const d = merged(task, ctx), adding = d.roleAction !== 'remove';
      return [
        {id: 'reject-role', label: 'Отклонить', kind: 'secondary', icon: 'reject', nextStatus: 'Завершено',
          sheetTitle: 'Причина отклонения', copy: `Пожалуйста, укажите, почему вы не можете принять ${adding ? 'назначение на роль' : 'удаление с роли'} «Аналитик процесса».`,
          commentRequired: true, confirmLabel: 'Отправить', patch: {roleDecision: 'rejected', acknowledged: false}},
        {id: 'accept-role', label: 'Принять', kind: 'primary', icon: 'tick', nextStatus: 'Завершено', immediate: true,
          disabled: adding && !d.acknowledged,
          validate: current => adding && !current.acknowledged ? {acknowledged: 'Подтвердите ознакомление с описанием роли'} : {},
          patch: current => ({roleDecision: 'accepted', acknowledged: adding ? Boolean(current.acknowledged) : false})}
      ];
    }
  };

  function itemFields() {
    return [
      {key: 'title', label: 'Название варианта предоставления результата процесса', kind: 'text', required: true, placeholder: 'Введите название варианта'},
      {key: 'channel', label: 'Канал исполнения', kind: 'select', required: true, options: channels, placeholder: 'Выберите',
        help: 'При отсутствии нужного канала его необходимо завести в ЕКОУ. Инструкция доступна в корпоративной базе знаний.'},
      {key: 'service', label: 'Услуга', kind: 'select', required: true, options: services, placeholder: 'Выберите'},
      {key: 'segment', label: 'Сегмент', kind: 'select', required: true, options: segments, placeholder: 'Выберите'},
      {key: 'businessDescription', label: 'Бизнес описание', kind: 'select', required: true, options: descriptions, placeholder: 'Выберите'}
    ];
  }

  function proposalField(d, ctx, {editable = false, interactive = false} = {}) {
    return {key: 'proposedVariants', label: editable ? 'Предлагаемые варианты' : 'Предложенные варианты', kind: 'variants',
      value: list(d.proposedVariants), editable, interactive, required: editable, allowDelete: editable,
      itemFields: itemFields(), emptyText: 'Предложите варианты',
      emptyHelp: 'Добавьте вариант предоставления результата процесса для согласования.',
      existing: existingVariants(d, ctx), selectExisting: false};
  }

  function variantSelector(d, ctx) {
    return {key: 'selectedVariantId', label: 'Вариант предоставления результата процесса', kind: 'select', required: true,
      value: d.selectedVariantId, disabled: !d.processId, options: existingVariants(d, ctx).map(item => ({value: item.id, label: item.title})),
      placeholder: d.processId ? 'Выберите' : 'Сначала выберите процесс'};
  }

  const changeKeys = [
    ['title', 'newTitle', 'Текущее название', 'Новое название', 'text'],
    ['service', 'newService', 'Текущая услуга', 'Новая услуга', 'select', services],
    ['segment', 'newSegment', 'Текущий сегмент', 'Новый сегмент', 'select', segments],
    ['channel', 'newChannel', 'Текущий канал исполнения', 'Новый канал исполнения', 'select', channels],
    ['businessDescription', 'newBusinessDescription', 'Текущее бизнес описание', 'Новое бизнес описание', 'select', descriptions]
  ];

  function comparisonFields(d, ctx, viewing = false) {
    const before = d.beforeVariant || selectedVariant(d, ctx);
    if (!before) return [];
    return changeKeys.map(([property, key, previousLabel, label, kind, options]) => ({key, label, kind: viewing ? 'readonly' : kind,
      value: d[key] || '', required: !viewing, placeholder: kind === 'text' ? 'Введите новое название' : 'Выберите',
      previousLabel, previousValue: before[property] || '—', previousTone: property === 'businessDescription' ? 'link' : undefined,
      ...(viewing && property === 'businessDescription' ? {tone: 'link'} : {}),
      group: viewing ? 'variant-comparison' : `variant-${property}`, card: true, comparison: true,
      ...(options ? {options} : {})}));
  }

  function selectedVariantFields(d, ctx) {
    const item = d.beforeVariant || selectedVariant(d, ctx);
    if (!item) return [];
    return [{key: 'existing-title', kind: 'heading', text: item.title, group: 'existing-variant', card: true, columns: 2},
      ...variantPropertyLabels.filter(([key]) => key !== 'title').map(([key, label]) => ({key: `existing-${key}`, label, kind: 'readonly', value: item[key] || '—',
        group: 'existing-variant', card: true, ...(key === 'businessDescription' ? {tone: 'link'} : {})}))];
  }

  const operationLabels = {
    create: 'Согласование варианта предоставления результата процесса',
    change: 'Изменение варианта предоставления результата процесса',
    delete: 'Удаление варианта предоставления результата процесса'
  };

  const resultApproval = {
    id: 'process-result-approval', label: operationLabels.create, tag: 'Варианты', prefix: 'ВАР',
    formTitle: d => operationLabels[d.operation] || operationLabels.create,
    initial: () => ({...commonInitial(), operation: 'create', proposedVariants: [], selectedVariantId: '', beforeVariant: null,
      newTitle: '', newService: '', newSegment: '', newChannel: '', newBusinessDescription: '', variantDecision: ''}),
    fields(d, ctx) {
      const fields = [
        {key: 'operation', label: 'Действие с вариантом', kind: 'radio', required: true, value: d.operation,
          options: [{value: 'create', label: 'Создание'}, {value: 'change', label: 'Изменение'}, {value: 'delete', label: 'Удаление'}]},
        titleField(d), deadlineField(d), processField(d)
      ];
      if (d.operation === 'create') fields.push(proposalField(d, ctx, {editable: true}));
      else {
        fields.push(variantSelector(d, ctx));
        if (d.operation === 'change') fields.push({key: 'change-heading', kind: 'heading', text: 'Предложение по изменению'}, ...comparisonFields(d, ctx));
        if (d.operation === 'delete') fields.push(...selectedVariantFields(d, ctx),
          {key: 'description', label: 'Обоснование удаления', kind: 'textarea', required: true,
            value: d.description, placeholder: 'Введите обоснование удаления варианта'});
      }
      fields.push(assigneesField(d));
      return fields;
    },
    viewFields(d, ctx) {
      const done = terminal(ctx.task || d), fields = [deadlineField(d), initiatorField(d, ctx), processField(d)];
      if (d.operation === 'create') {
        if (!done) fields.push(
          {key: 'proposal-heading', kind: 'heading', text: 'Предложенные варианты'},
          {key: 'selection-guide', kind: 'note', tone: 'plain', text: 'Необходимо выбрать варианты для согласования.'},
          {key: 'selection-warning', kind: 'note', tone: 'warning', text: 'Обратите внимание! Невыбранные варианты будут автоматически отклонены.'});
        fields.push({...proposalField(d, ctx, {interactive: !done}), ...(!done ? {label: ''} : {})});
      } else if (d.operation === 'change') fields.push(
        {key: 'change-heading', kind: 'heading', text: done ? 'Изменения варианта предоставления результата процесса' : 'Согласуйте изменения варианта предоставления результата процесса'},
        ...comparisonFields(d, ctx, true));
      else fields.push({key: 'description', label: 'Обоснование удаления', kind: 'readonly', value: d.description},
        {key: 'variant-heading', kind: 'heading', text: 'Вариант предоставления результата процесса'}, ...selectedVariantFields(d, ctx));
      fields.push(assigneesField(d));
      return fields;
    },
    validate(d, ctx) {
      const errors = validateCommon(d, ctx, {description: d.operation === 'delete'});
      if (!Object.hasOwn(operationLabels, d.operation)) errors.operation = 'Выберите действие с вариантом';
      if (d.operation === 'create') {
        const variants = list(d.proposedVariants);
        if (!variants.length) errors.proposedVariants = 'Добавьте хотя бы один вариант';
        else if (variants.some(item => variantPropertyLabels.some(([key]) => !str(item[key])))) errors.proposedVariants = 'Заполните все поля предложенных вариантов';
        else if (new Set(variants.map(item => str(item.title).toLocaleLowerCase('ru'))).size !== variants.length) errors.proposedVariants = 'Названия предложенных вариантов не должны повторяться';
      } else {
        const before = selectedVariant(d, ctx);
        if (!before) errors.selectedVariantId = 'Выберите вариант предоставления результата процесса';
        if (d.operation === 'change') {
          changeKeys.forEach(([, key, , label]) => {if (!str(d[key])) errors[key] = `Заполните поле «${label}»`;});
          if (before && changeKeys.every(([property, key]) => str(d[key]) === str(before[property]))) errors.newTitle = 'Внесите хотя бы одно изменение';
        }
      }
      return errors;
    },
    onCreate(d, ctx) {
      return {operation: d.operation, variantDecision: '', beforeVariant: d.operation === 'create' ? null : copy(selectedVariant(d, ctx)),
        proposedVariants: d.operation === 'create' ? list(d.proposedVariants).map((item, index) => ({...copy(item), id: item.id || `proposal-${index + 1}`, approved: item.approved !== false})) : []};
    },
    actions(task, ctx) {
      const d = merged(task, ctx);
      return approvalActions(task, {rejectPatch: current => ({variantDecision: 'rejected',
        ...(d.operation === 'create' ? {proposedVariants: list(current.proposedVariants).map(item => ({...item, approved: false, decision: 'rejected'}))} : {})}),
        approvePatch: current => ({variantDecision: 'approved',
        ...(d.operation === 'create' ? {proposedVariants: list(current.proposedVariants).map(item => ({...item,
          approved: Boolean(item.approved), decision: item.approved ? 'approved' : 'rejected'}))} : {})})});
    }
  };

  Object.assign(window.BpmTaskTypes || (window.BpmTaskTypes = {}), {
    [access.id]: access, [roleManagement.id]: roleManagement, [resultApproval.id]: resultApproval
  });
})();
