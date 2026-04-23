import express, { Request, Response } from 'express';
import cors from 'cors';
import { getInvoices, getInvoiceById } from './db';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/invoices', (req: Request, res: Response) => {
  try {
    const { status, freelancer, payer, funder } = req.query;
    
    // Requirements say "?funder=" but the DB has "payer"
    // We'll treat funder and payer as interchangeable for this query
    const filterPayer = (payer as string) || (funder as string);

    const invoices = getInvoices({
      status: status as string,
      freelancer: freelancer as string,
      payer: filterPayer
    });

    res.json({ success: true, data: invoices });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/invoice/:id', (req: Request, res: Response): void => {
  try {
    const { id } = req.params;
    const invoice = getInvoiceById(id as string);
    
    if (!invoice) {
      res.status(404).json({ success: false, error: 'Invoice not found' });
      return;
    }

    res.json({ success: true, data: invoice });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default app;
