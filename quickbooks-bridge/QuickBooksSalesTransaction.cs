using System;
using System.Collections;
using System.Globalization;
using System.Runtime.InteropServices;
using Interop.QBFC18;

namespace LibraryPos.QuickBooksBridge
{
    internal sealed class QuickBooksSalesTransactionLine
    {
        internal string ItemListId;
        internal string Description;
        internal double Quantity;
        internal double Amount;
        internal string TaxCodeListId;
    }

    internal sealed class QuickBooksSalesTransactionRequest
    {
        internal string TransactionType;
        internal string CustomerListId;
        internal string AccountsReceivableAccountListId;
        internal string PaymentMethodListId;
        internal string DepositAccountListId;
        internal string ItemSalesTaxListId;
        internal string TaxTreatment;
        internal string RefNumber;
        internal string Memo;
        internal DateTime TransactionDate;
        internal QuickBooksSalesTransactionLine[] Lines;

        internal static QuickBooksSalesTransactionRequest Parse(IDictionary values)
        {
            QuickBooksSalesTransactionRequest result = new QuickBooksSalesTransactionRequest();
            result.TransactionType = RequiredString(values, "transactionType", 20);
            if (result.TransactionType != "SalesReceipt" && result.TransactionType != "Invoice")
            {
                throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", "transactionType must be SalesReceipt or Invoice.", 400);
            }

            result.CustomerListId = RequiredString(values, "customerListId", 100);
            result.AccountsReceivableAccountListId = OptionalString(values, "accountsReceivableAccountListId", 100);
            result.PaymentMethodListId = OptionalString(values, "paymentMethodListId", 100);
            result.DepositAccountListId = OptionalString(values, "depositAccountListId", 100);
            result.ItemSalesTaxListId = OptionalString(values, "itemSalesTaxListId", 100);
            result.TaxTreatment = RequiredString(values, "taxTreatment", 20);
            if (result.TaxTreatment != "inclusive" && result.TaxTreatment != "exclusive")
            {
                throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", "taxTreatment must be inclusive or exclusive.", 400);
            }
            result.RefNumber = RequiredString(values, "refNumber", 11);
            result.Memo = OptionalString(values, "memo", 4095);

            string dateValue = RequiredString(values, "transactionDate", 40);
            if (!DateTime.TryParse(dateValue, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out result.TransactionDate))
            {
                throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", "transactionDate must be a valid ISO date.", 400);
            }
            result.TransactionDate = result.TransactionDate.Date;

            if (result.TransactionType == "Invoice" && String.IsNullOrWhiteSpace(result.AccountsReceivableAccountListId))
            {
                throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", "An accounts receivable account is required for invoices.", 400);
            }
            if (result.TransactionType == "SalesReceipt" &&
                (String.IsNullOrWhiteSpace(result.PaymentMethodListId) || String.IsNullOrWhiteSpace(result.DepositAccountListId)))
            {
                throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", "Payment method and deposit account are required for sales receipts.", 400);
            }

            IList rawLines = values.Contains("lines") ? values["lines"] as IList : null;
            if (rawLines == null || rawLines.Count < 1 || rawLines.Count > 100)
            {
                throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", "A transaction must contain between 1 and 100 lines.", 400);
            }

            result.Lines = new QuickBooksSalesTransactionLine[rawLines.Count];
            for (int index = 0; index < rawLines.Count; index++)
            {
                IDictionary lineValues = rawLines[index] as IDictionary;
                if (lineValues == null)
                {
                    throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", "Each transaction line must be an object.", 400);
                }

                double quantity = RequiredNumber(lineValues, "quantity");
                double amount = RequiredNumber(lineValues, "amount");
                if (quantity <= 0 || quantity > 1000000000 || quantity != Math.Truncate(quantity) ||
                    amount < 0 || amount > 1000000000000)
                {
                    throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", "Line quantity must be a positive whole number and amount must be non-negative.", 400);
                }

                result.Lines[index] = new QuickBooksSalesTransactionLine
                {
                    ItemListId = RequiredString(lineValues, "itemListId", 100),
                    Description = OptionalString(lineValues, "description", 4095),
                    Quantity = quantity,
                    Amount = amount,
                    TaxCodeListId = RequiredString(lineValues, "taxCodeListId", 100),
                };
            }

            return result;
        }

        private static string RequiredString(IDictionary values, string key, int maximumLength)
        {
            string value = OptionalString(values, key, maximumLength);
            if (String.IsNullOrWhiteSpace(value))
            {
                throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", key + " is required.", 400);
            }
            return value;
        }

        private static string OptionalString(IDictionary values, string key, int maximumLength)
        {
            if (values == null || !values.Contains(key) || values[key] == null) return "";
            string value = values[key] as string;
            if (value == null || value.Length > maximumLength)
            {
                throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", key + " must be a string within the allowed length.", 400);
            }
            return value.Trim();
        }

        private static double RequiredNumber(IDictionary values, string key)
        {
            double value;
            if (values == null || !values.Contains(key) || values[key] == null ||
                !Double.TryParse(Convert.ToString(values[key], CultureInfo.InvariantCulture),
                    NumberStyles.Float, CultureInfo.InvariantCulture, out value) ||
                Double.IsNaN(value) || Double.IsInfinity(value))
            {
                throw new QuickBooksBridgeException("INVALID_SALES_TRANSACTION", key + " must be a finite number.", 400);
            }
            return value;
        }
    }

    internal sealed class QuickBooksSalesTransactionResult
    {
        internal QuickBooksSalesTransactionResult(
            string txnId,
            string txnNumber,
            string refNumber,
            double totalAmount,
            string customerListId,
            string memo,
            bool existing)
        {
            TxnId = txnId;
            TxnNumber = txnNumber;
            RefNumber = refNumber;
            TotalAmount = totalAmount;
            CustomerListId = customerListId;
            Memo = memo;
            Existing = existing;
        }

        internal string TxnId { get; private set; }
        internal string TxnNumber { get; private set; }
        internal string RefNumber { get; private set; }
        internal double TotalAmount { get; private set; }
        internal string CustomerListId { get; private set; }
        internal string Memo { get; private set; }
        internal bool Existing { get; private set; }
    }

    internal static class QuickBooksSalesTransaction
    {
        private const string ApplicationName = "Library POS QuickBooks Bridge";

        internal static QuickBooksSalesTransactionResult Execute(string sdkCountry, QuickBooksSalesTransactionRequest sale)
        {
            QBSessionManagerClass manager = null;
            bool connectionOpened = false;
            bool sessionBegun = false;
            try
            {
                manager = new QBSessionManagerClass();
                manager.OpenConnection2("", ApplicationName, ENConnectionType.ctLocalQBD);
                connectionOpened = true;
                manager.BeginSession("", ENOpenMode.omDontCare);
                sessionBegun = true;

                short majorVersion;
                short minorVersion;
                string qbxmlVersion = QuickBooksCompanyQuery.SelectSupportedQbxmlVersion(
                    manager.QBXMLVersionsForSession, out majorVersion, out minorVersion);
                if (qbxmlVersion == null)
                {
                    throw new QuickBooksBridgeException("QBXML_VERSION_UNSUPPORTED", "QuickBooks did not report a usable qbXML version.");
                }

                QuickBooksSalesTransactionResult existing = FindByReference(
                    manager, sdkCountry, majorVersion, minorVersion, sale);
                if (existing != null) return existing;

                IMsgSetRequest requestSet = CreateRequestSet(manager, sdkCountry, majorVersion, minorVersion);
                IResponseList responseList;
                if (sale.TransactionType == "SalesReceipt")
                {
                    ISalesReceiptAdd add = requestSet.AppendSalesReceiptAddRq();
                    add.CustomerRef.ListID.SetValue(sale.CustomerListId);
                    add.TxnDate.SetValue(sale.TransactionDate);
                    add.RefNumber.SetValue(sale.RefNumber);
                    if (!String.IsNullOrWhiteSpace(sale.Memo)) add.Memo.SetValue(sale.Memo);
                    add.IsTaxIncluded.SetValue(sale.TaxTreatment == "inclusive");
                    if (!String.IsNullOrWhiteSpace(sale.ItemSalesTaxListId)) add.ItemSalesTaxRef.ListID.SetValue(sale.ItemSalesTaxListId);
                    add.PaymentMethodRef.ListID.SetValue(sale.PaymentMethodListId);
                    add.DepositToAccountRef.ListID.SetValue(sale.DepositAccountListId);
                    add.IncludeRetElementList.Add("TxnID");
                    add.IncludeRetElementList.Add("TxnNumber");
                    add.IncludeRetElementList.Add("RefNumber");
                    add.IncludeRetElementList.Add("TotalAmount");
                    add.IncludeRetElementList.Add("CustomerRef");
                    add.IncludeRetElementList.Add("Memo");
                    AddReceiptLines(add.ORSalesReceiptLineAddList, sale.Lines);
                    responseList = manager.DoRequests(requestSet).ResponseList;
                    return ReadReceiptResponse(responseList, sale.RefNumber, false);
                }

                IInvoiceAdd invoice = requestSet.AppendInvoiceAddRq();
                invoice.CustomerRef.ListID.SetValue(sale.CustomerListId);
                invoice.ARAccountRef.ListID.SetValue(sale.AccountsReceivableAccountListId);
                invoice.TxnDate.SetValue(sale.TransactionDate);
                invoice.RefNumber.SetValue(sale.RefNumber);
                if (!String.IsNullOrWhiteSpace(sale.Memo)) invoice.Memo.SetValue(sale.Memo);
                invoice.IsTaxIncluded.SetValue(sale.TaxTreatment == "inclusive");
                if (!String.IsNullOrWhiteSpace(sale.ItemSalesTaxListId)) invoice.ItemSalesTaxRef.ListID.SetValue(sale.ItemSalesTaxListId);
                invoice.IncludeRetElementList.Add("TxnID");
                invoice.IncludeRetElementList.Add("TxnNumber");
                invoice.IncludeRetElementList.Add("RefNumber");
                invoice.IncludeRetElementList.Add("Subtotal");
                invoice.IncludeRetElementList.Add("SalesTaxTotal");
                invoice.IncludeRetElementList.Add("CustomerRef");
                invoice.IncludeRetElementList.Add("Memo");
                AddInvoiceLines(invoice.ORInvoiceLineAddList, sale.Lines);
                responseList = manager.DoRequests(requestSet).ResponseList;
                return ReadInvoiceResponse(responseList, sale.RefNumber, false);
            }
            catch (QuickBooksBridgeException)
            {
                throw;
            }
            catch (COMException error)
            {
                throw new QuickBooksBridgeException("QUICKBOOKS_COM_ERROR",
                    "HRESULT 0x" + error.ErrorCode.ToString("X8") + ": " + Program.Sanitize(error.Message));
            }
            finally
            {
                if (sessionBegun) manager.EndSession();
                if (connectionOpened) manager.CloseConnection();
            }
        }

        private static IMsgSetRequest CreateRequestSet(QBSessionManagerClass manager, string country, short major, short minor)
        {
            IMsgSetRequest request = manager.CreateMsgSetRequest(country.ToUpperInvariant(), major, minor);
            request.Attributes.OnError = ENRqOnError.roeStop;
            return request;
        }

        private static QuickBooksSalesTransactionResult FindByReference(
            QBSessionManagerClass manager,
            string country,
            short major,
            short minor,
            QuickBooksSalesTransactionRequest sale)
        {
            IMsgSetRequest requestSet = CreateRequestSet(manager, country, major, minor);
            if (sale.TransactionType == "SalesReceipt")
            {
                ISalesReceiptQuery query = requestSet.AppendSalesReceiptQueryRq();
                query.ORTxnQuery.RefNumberCaseSensitiveList.Add(sale.RefNumber);
                query.IncludeRetElementList.Add("TxnID");
                query.IncludeRetElementList.Add("TxnNumber");
                query.IncludeRetElementList.Add("RefNumber");
                query.IncludeRetElementList.Add("TotalAmount");
                query.IncludeRetElementList.Add("CustomerRef");
                query.IncludeRetElementList.Add("Memo");
                return ReadReceiptResponse(manager.DoRequests(requestSet).ResponseList, sale.RefNumber, true);
            }

            IInvoiceQuery invoiceQuery = requestSet.AppendInvoiceQueryRq();
            invoiceQuery.ORInvoiceQuery.RefNumberCaseSensitiveList.Add(sale.RefNumber);
            invoiceQuery.IncludeRetElementList.Add("TxnID");
            invoiceQuery.IncludeRetElementList.Add("TxnNumber");
            invoiceQuery.IncludeRetElementList.Add("RefNumber");
            invoiceQuery.IncludeRetElementList.Add("Subtotal");
            invoiceQuery.IncludeRetElementList.Add("SalesTaxTotal");
            invoiceQuery.IncludeRetElementList.Add("CustomerRef");
            invoiceQuery.IncludeRetElementList.Add("Memo");
            return ReadInvoiceResponse(manager.DoRequests(requestSet).ResponseList, sale.RefNumber, true);
        }

        private static void AddReceiptLines(IORSalesReceiptLineAddList list, QuickBooksSalesTransactionLine[] lines)
        {
            foreach (QuickBooksSalesTransactionLine source in lines)
            {
                ISalesReceiptLineAdd line = list.Append().SalesReceiptLineAdd;
                line.ItemRef.ListID.SetValue(source.ItemListId);
                line.Quantity.SetValue(source.Quantity);
                line.Amount.SetValue(source.Amount);
                line.SalesTaxCodeRef.ListID.SetValue(source.TaxCodeListId);
                if (!String.IsNullOrWhiteSpace(source.Description)) line.Desc.SetValue(source.Description);
            }
        }

        private static void AddInvoiceLines(IORInvoiceLineAddList list, QuickBooksSalesTransactionLine[] lines)
        {
            foreach (QuickBooksSalesTransactionLine source in lines)
            {
                IInvoiceLineAdd line = list.Append().InvoiceLineAdd;
                line.ItemRef.ListID.SetValue(source.ItemListId);
                line.Quantity.SetValue(source.Quantity);
                line.Amount.SetValue(source.Amount);
                line.SalesTaxCodeRef.ListID.SetValue(source.TaxCodeListId);
                if (!String.IsNullOrWhiteSpace(source.Description)) line.Desc.SetValue(source.Description);
            }
        }

        private static QuickBooksSalesTransactionResult ReadReceiptResponse(IResponseList responses, string refNumber, bool query)
        {
            IResponse response = RequireOneResponse(responses);
            if (response.StatusCode != 0)
            {
                throw ResponseFailure(response);
            }
            ISalesReceiptRet record;
            if (query)
            {
                ISalesReceiptRetList records = response.Detail as ISalesReceiptRetList;
                if (records == null)
                {
                    throw new QuickBooksBridgeException("SALES_RECEIPT_RESPONSE_INVALID", "QuickBooks returned an unexpected sales receipt query response.");
                }
                if (records.Count == 0) return null;
                if (records.Count != 1)
                {
                    throw new QuickBooksBridgeException("SALES_RECEIPT_REFERENCE_AMBIGUOUS", "QuickBooks returned multiple sales receipts with the same reference number.", 409);
                }
                record = records.GetAt(0);
            }
            else
            {
                record = response.Detail as ISalesReceiptRet;
                if (record == null)
                {
                    throw new QuickBooksBridgeException("SALES_RECEIPT_RESPONSE_INVALID", "QuickBooks returned an unexpected sales receipt add response.");
                }
            }
            string txnId = record.TxnID != null && record.TxnID.IsSet() ? record.TxnID.GetValue() : null;
            if (String.IsNullOrWhiteSpace(txnId))
            {
                throw new QuickBooksBridgeException("SALES_RECEIPT_TXN_MISSING", "QuickBooks did not return a sales receipt transaction identifier.");
            }
            return new QuickBooksSalesTransactionResult(
                txnId,
                record.TxnNumber != null && record.TxnNumber.IsSet() ? record.TxnNumber.GetValue().ToString(CultureInfo.InvariantCulture) : null,
                record.RefNumber != null && record.RefNumber.IsSet() ? record.RefNumber.GetValue() : refNumber,
                record.TotalAmount != null && record.TotalAmount.IsSet() ? record.TotalAmount.GetValue() : 0,
                record.CustomerRef != null && record.CustomerRef.ListID != null && record.CustomerRef.ListID.IsSet()
                    ? record.CustomerRef.ListID.GetValue()
                    : "",
                record.Memo != null && record.Memo.IsSet() ? record.Memo.GetValue() : "",
                query);
        }

        private static QuickBooksSalesTransactionResult ReadInvoiceResponse(IResponseList responses, string refNumber, bool query)
        {
            IResponse response = RequireOneResponse(responses);
            if (response.StatusCode != 0)
            {
                throw ResponseFailure(response);
            }
            IInvoiceRet record;
            if (query)
            {
                IInvoiceRetList records = response.Detail as IInvoiceRetList;
                if (records == null)
                {
                    throw new QuickBooksBridgeException("INVOICE_RESPONSE_INVALID", "QuickBooks returned an unexpected invoice query response.");
                }
                if (records.Count == 0) return null;
                if (records.Count != 1)
                {
                    throw new QuickBooksBridgeException("INVOICE_REFERENCE_AMBIGUOUS", "QuickBooks returned multiple invoices with the same reference number.", 409);
                }
                record = records.GetAt(0);
            }
            else
            {
                record = response.Detail as IInvoiceRet;
                if (record == null)
                {
                    throw new QuickBooksBridgeException("INVOICE_RESPONSE_INVALID", "QuickBooks returned an unexpected invoice add response.");
                }
            }
            string txnId = record.TxnID != null && record.TxnID.IsSet() ? record.TxnID.GetValue() : null;
            if (String.IsNullOrWhiteSpace(txnId))
            {
                throw new QuickBooksBridgeException("INVOICE_TXN_MISSING", "QuickBooks did not return an invoice transaction identifier.");
            }
            return new QuickBooksSalesTransactionResult(
                txnId,
                record.TxnNumber != null && record.TxnNumber.IsSet() ? record.TxnNumber.GetValue().ToString(CultureInfo.InvariantCulture) : null,
                record.RefNumber != null && record.RefNumber.IsSet() ? record.RefNumber.GetValue() : refNumber,
                (record.Subtotal != null && record.Subtotal.IsSet() ? record.Subtotal.GetValue() : 0) +
                (record.SalesTaxTotal != null && record.SalesTaxTotal.IsSet() ? record.SalesTaxTotal.GetValue() : 0),
                record.CustomerRef != null && record.CustomerRef.ListID != null && record.CustomerRef.ListID.IsSet()
                    ? record.CustomerRef.ListID.GetValue()
                    : "",
                record.Memo != null && record.Memo.IsSet() ? record.Memo.GetValue() : "",
                query);
        }

        private static IResponse RequireOneResponse(IResponseList responses)
        {
            if (responses == null || responses.Count != 1)
            {
                throw new QuickBooksBridgeException("SALES_TRANSACTION_RESPONSE_INVALID", "QuickBooks returned an unexpected transaction response count.");
            }
            return responses.GetAt(0);
        }

        private static QuickBooksBridgeException ResponseFailure(IResponse response)
        {
            return new QuickBooksBridgeException(
                "QUICKBOOKS_SALES_TRANSACTION_FAILED",
                "QuickBooks transaction failed: " + Program.Sanitize(response.StatusMessage),
                409);
        }
    }
}
