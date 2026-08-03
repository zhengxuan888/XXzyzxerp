UPDATE "Menu"
SET "requiredActionKey" = 'role.template.manage', "updatedAt" = NOW()
WHERE path = '/admin/roles';
