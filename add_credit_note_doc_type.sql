-- Fix Document Type Constraint for workflow_documents to include 'Credit Note'
ALTER TABLE public.workflow_documents 
DROP CONSTRAINT IF EXISTS workflow_documents_document_type_check;

ALTER TABLE public.workflow_documents 
ADD CONSTRAINT workflow_documents_document_type_check 
CHECK (document_type IN (
    'Enquiry', 
    'Quotation', 
    'Job',
    'Purchase Order', 
    'Order Acknowledgment',
    'Delivery Order', 
    'Service Report', 
    'Proforma Invoice', 
    'Packing List', 
    'Tax Invoice',
    'Certificate',
    'Payment Received',
    'Statement of Account',
    'Credit Note'
));
