ALTER TABLE "Expense" ADD COLUMN "departmentId" TEXT;
CREATE INDEX "Expense_businessUnitId_departmentId_category_idx" ON "Expense"("businessUnitId", "departmentId", "category");
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "Department"("id") ON DELETE SET NULL ON UPDATE CASCADE;
