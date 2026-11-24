using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using Interop.QBFC18;

namespace LibraryPos.QuickBooksBridge
{
    internal sealed class QuickBooksInventoryAdjustmentResult
    {
        internal QuickBooksInventoryAdjustmentResult(string txnId, string txnNumber, string refNumber)
        {
            TxnId = txnId;
            TxnNumber = txnNumber;
            RefNumber = refNumber;
        }

        internal string TxnId { get; private set; }
        internal string TxnNumber { get; private set; }
        internal string RefNumber { get; private set; }
    }

    internal static class QuickBooksInventoryAdjustment
    {
        private const string ApplicationName = "Library POS QuickBooks Bridge";

        internal static QuickBooksInventoryAdjustmentResult Execute(
            string sdkCountry,
            string accountListId,
            string itemListId,
            double quantityDifference,
            string refNumber,
            string memo
        )
        {
            QBSessionManagerClass manager = null;
            IMsgSetRequest requestSet = null;
            IAttributesRqSet requestAttributes = null;
            IInventoryAdjustmentAdd adjustment = null;
            IMsgSetResponse responseSet = null;
            IResponseList responseList = null;
            IResponse response = null;
            IInventoryAdjustmentRet detail = null;
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
                    manager.QBXMLVersionsForSession,
                    out majorVersion,
                    out minorVersion
                );
                if (qbxmlVersion == null)
                {
                    throw new QuickBooksBridgeException("QBXML_VERSION_UNSUPPORTED",
                        "QuickBooks did not report a usable qbXML version.");
                }

                requestSet = manager.CreateMsgSetRequest(sdkCountry.ToUpperInvariant(), majorVersion, minorVersion);
                requestAttributes = requestSet.Attributes;
                requestAttributes.OnError = ENRqOnError.roeStop;

                adjustment = requestSet.AppendInventoryAdjustmentAddRq();
                adjustment.AccountRef.ListID.SetValue(accountListId);
                adjustment.Memo.SetValue(memo.Length > 4095 ? memo.Substring(0, 4095) : memo);
                if (!String.IsNullOrWhiteSpace(refNumber))
                {
                    adjustment.RefNumber.SetValue(refNumber.Length > 11 ? refNumber.Substring(0, 11) : refNumber);
                }

                IInventoryAdjustmentLineAddList lines = adjustment.InventoryAdjustmentLineAddList;
                IInventoryAdjustmentLineAdd line = lines.Append();
                line.ItemRef.ListID.SetValue(itemListId);
                line.ORTypeAdjustment.QuantityAdjustment.ORQuantityAdjustment.QuantityDifference.SetValue(quantityDifference);

                responseSet = manager.DoRequests(requestSet);
                responseList = responseSet.ResponseList;
                if (responseList.Count != 1)
                {
                    throw new QuickBooksBridgeException("INVENTORY_ADJUSTMENT_RESPONSE_INVALID",
                        "QuickBooks returned an unexpected inventory adjustment response count.");
                }

                response = responseList.GetAt(0);
                if (response.StatusCode != 0)
                {
                    throw new QuickBooksBridgeException("QUICKBOOKS_INVENTORY_ADJUSTMENT_FAILED",
                        "QuickBooks inventory adjustment failed: " +
                        Program.Sanitize(response.StatusMessage), 409);
                }

                detail = response.Detail as IInventoryAdjustmentRet;
                if (detail == null)
                {
                    throw new QuickBooksBridgeException("INVENTORY_ADJUSTMENT_RESPONSE_INVALID",
                        "QuickBooks returned an unexpected inventory adjustment record.");
                }

                string txnId = detail.TxnID != null && detail.TxnID.IsSet()
                    ? detail.TxnID.GetValue()
                    : null;
                string txnNumber = detail.TxnNumber != null && detail.TxnNumber.IsSet()
                    ? detail.TxnNumber.GetValue().ToString(System.Globalization.CultureInfo.InvariantCulture)
                    : null;
                string adjustedRef = detail.RefNumber != null && detail.RefNumber.IsSet()
                    ? detail.RefNumber.GetValue()
                    : null;

                if (String.IsNullOrWhiteSpace(txnId))
                {
                    throw new QuickBooksBridgeException("INVENTORY_ADJUSTMENT_TXN_MISSING",
                        "QuickBooks did not return a transaction identifier.");
                }
                return new QuickBooksInventoryAdjustmentResult(txnId, txnNumber, adjustedRef);
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
    }
}
