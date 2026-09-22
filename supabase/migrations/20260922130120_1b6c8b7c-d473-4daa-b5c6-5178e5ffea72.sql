ALTER TABLE public.credit_transactions DROP CONSTRAINT IF EXISTS credit_transactions_transaction_type_check;
ALTER TABLE public.credit_transactions ADD CONSTRAINT credit_transactions_transaction_type_check
  CHECK (transaction_type = ANY (ARRAY['purchase','usage','refund','bonus','grant','reservation','release','settlement']));