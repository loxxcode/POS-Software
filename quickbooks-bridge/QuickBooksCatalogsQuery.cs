using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
using Interop.QBFC18;

namespace LibraryPos.QuickBooksBridge
{
    internal sealed class QuickBooksCatalogEntry
    {
        internal QuickBooksCatalogEntry(
            string listId,
            string name,
            string fullName,
            string type,
            bool isSalesItem,
            bool? isTaxable,
            double? taxRate,
            double? quantityOnHand = null,
            double? salesPrice = null
        )
        {
            ListId = listId;
            Name = name;
            FullName = fullName;
            Type = type;
            IsSalesItem = isSalesItem;
            IsTaxable = isTaxable;
            TaxRate = taxRate;
            QuantityOnHand = quantityOnHand;
            SalesPrice = salesPrice;
        }

        internal string ListId { get; private set; }
        internal string Name { get; private set; }
        internal string FullName { get; private set; }
        internal string Type { get; private set; }
        internal bool IsSalesItem { get; private set; }
        internal bool? IsTaxable { get; private set; }
        internal double? TaxRate { get; private set; }
        internal double? QuantityOnHand { get; private set; }
        internal double? SalesPrice { get; private set; }

        internal string ToJson()
        {
            return "{\"listId\":\"" + Program.EscapeJson(ListId) +
                "\",\"name\":\"" + Program.EscapeJson(Name) +
                "\",\"fullName\":" + NullableJsonString(FullName) +
                ",\"type\":\"" + Program.EscapeJson(Type) +
                "\",\"isSalesItem\":" + (IsSalesItem ? "true" : "false") +
                ",\"isTaxable\":" + (IsTaxable.HasValue ? (IsTaxable.Value ? "true" : "false") : "null") +
                ",\"taxRate\":" + (TaxRate.HasValue ? TaxRate.Value.ToString("R", System.Globalization.CultureInfo.InvariantCulture) : "null") +
                ",\"quantityOnHand\":" + NullableJsonNumber(QuantityOnHand) +
                ",\"salesPrice\":" + NullableJsonNumber(SalesPrice) +
                "}";
        }

        private static string NullableJsonString(string value)
        {
            return value == null ? "null" : "\"" + Program.EscapeJson(value) + "\"";
        }

        private static string NullableJsonNumber(double? value)
        {
            return value.HasValue
                ? value.Value.ToString("R", System.Globalization.CultureInfo.InvariantCulture)
                : "null";
        }
    }

    internal sealed class QuickBooksCatalogsInfo
    {
        internal readonly List<QuickBooksCatalogEntry> Items = new List<QuickBooksCatalogEntry>();
        internal readonly List<QuickBooksCatalogEntry> Customers = new List<QuickBooksCatalogEntry>();
        internal readonly List<QuickBooksCatalogEntry> SalesTaxCodes = new List<QuickBooksCatalogEntry>();
        internal readonly List<QuickBooksCatalogEntry> SalesTaxItems = new List<QuickBooksCatalogEntry>();
        internal readonly List<QuickBooksCatalogEntry> PaymentMethods = new List<QuickBooksCatalogEntry>();
        internal readonly List<QuickBooksCatalogEntry> Accounts = new List<QuickBooksCatalogEntry>();
        internal bool ItemsTruncated;
        internal bool CustomersTruncated;
        internal bool SalesTaxCodesTruncated;
        internal bool SalesTaxItemsTruncated;
        internal bool PaymentMethodsTruncated;
        internal bool AccountsTruncated;

        internal string ToJson()
        {
            return "{\"success\":true,\"data\":{" +
                "\"items\":" + ListJson(Items) +
                ",\"customers\":" + ListJson(Customers) +
                ",\"salesTaxCodes\":" + ListJson(SalesTaxCodes) +
                ",\"salesTaxItems\":" + ListJson(SalesTaxItems) +
                ",\"paymentMethods\":" + ListJson(PaymentMethods) +
                ",\"accounts\":" + ListJson(Accounts) +
                ",\"truncated\":{\"items\":" + BooleanJson(ItemsTruncated) +
                ",\"customers\":" + BooleanJson(CustomersTruncated) +
                ",\"salesTaxCodes\":" + BooleanJson(SalesTaxCodesTruncated) +
                ",\"salesTaxItems\":" + BooleanJson(SalesTaxItemsTruncated) +
                ",\"paymentMethods\":" + BooleanJson(PaymentMethodsTruncated) +
                ",\"accounts\":" + BooleanJson(AccountsTruncated) + "}}}";
        }

        private static string ListJson(List<QuickBooksCatalogEntry> entries)
        {
            StringBuilder json = new StringBuilder("[");
            for (int index = 0; index < entries.Count; index++)
            {
                if (index > 0)
                {
                    json.Append(",");
                }
                json.Append(entries[index].ToJson());
            }
            return json.Append("]").ToString();
        }

        private static string BooleanJson(bool value)
        {
            return value ? "true" : "false";
        }
    }

    internal static class QuickBooksCatalogsQuery
    {
        private const int MaximumReturned = 1000;
        private const string ApplicationName = "Library POS QuickBooks Bridge";

        internal static QuickBooksCatalogsInfo Execute(string sdkCountry)
        {
            QBSessionManagerClass manager = null;
            IMsgSetRequest requestSet = null;
            IAttributesRqSet requestAttributes = null;
            IItemQuery itemQuery = null;
            ICustomerQuery customerQuery = null;
            ISalesTaxCodeQuery salesTaxCodeQuery = null;
            IItemSalesTaxQuery salesTaxItemQuery = null;
            IPaymentMethodQuery paymentMethodQuery = null;
            IAccountQuery accountQuery = null;
            IORListQuery itemListQuery = null;
            IListFilter itemFilter = null;
            IQBIntType itemMaxReturned = null;
            IQBENActiveStatusType itemActiveStatus = null;
            IORCustomerListQuery customerListQuery = null;
            ICustomerListFilter customerFilter = null;
            IQBIntType customerMaxReturned = null;
            IQBENActiveStatusType customerActiveStatus = null;
            IORListQuery salesTaxCodeListQuery = null;
            IListFilter salesTaxCodeFilter = null;
            IQBIntType salesTaxCodeMaxReturned = null;
            IQBENActiveStatusType salesTaxCodeActiveStatus = null;
            IORListQueryWithOwnerIDAndClass salesTaxItemListQuery = null;
            IListWithClassFilter salesTaxItemFilter = null;
            IQBIntType salesTaxItemMaxReturned = null;
            IQBENActiveStatusType salesTaxItemActiveStatus = null;
            IORPaymentMethodListQuery paymentMethodListQuery = null;
            IPaymentMethodListFilter paymentMethodFilter = null;
            IQBIntType paymentMethodMaxReturned = null;
            IQBENActiveStatusType paymentMethodActiveStatus = null;
            IORAccountListQuery accountListQuery = null;
            IAccountListFilter accountFilter = null;
            IQBIntType accountMaxReturned = null;
            IQBENActiveStatusType accountActiveStatus = null;
            IMsgSetResponse responseSet = null;
            IResponseList responseList = null;
            IResponse itemResponse = null;
            IResponse customerResponse = null;
            IResponse salesTaxCodeResponse = null;
            IResponse salesTaxItemResponse = null;
            IResponse paymentMethodResponse = null;
            IResponse accountResponse = null;
            IORItemRetList items = null;
            ICustomerRetList customers = null;
            ISalesTaxCodeRetList salesTaxCodes = null;
            IItemSalesTaxRetList salesTaxItems = null;
            IPaymentMethodRetList paymentMethods = null;
            IAccountRetList accounts = null;
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
                    throw new QuickBooksBridgeException(
                        "QBXML_VERSION_UNSUPPORTED",
                        "QuickBooks did not report a usable qbXML version for this session."
                    );
                }

                requestSet = manager.CreateMsgSetRequest(
                    sdkCountry.ToUpperInvariant(),
                    majorVersion,
                    minorVersion
                );
                requestAttributes = requestSet.Attributes;
                requestAttributes.OnError = ENRqOnError.roeStop;

                itemQuery = requestSet.AppendItemQueryRq();
                AddElements(itemQuery.IncludeRetElementList, "ListID", "Name", "QuantityOnHand", "SalesPrice");
                itemListQuery = itemQuery.ORListQuery;
                itemFilter = itemListQuery.ListFilter;
                itemMaxReturned = itemFilter.MaxReturned;
                itemActiveStatus = itemFilter.ActiveStatus;
                ConfigureActiveFilter(itemMaxReturned, itemActiveStatus);

                customerQuery = requestSet.AppendCustomerQueryRq();
                AddElements(customerQuery.IncludeRetElementList, "ListID", "Name", "FullName");
                customerListQuery = customerQuery.ORCustomerListQuery;
                customerFilter = customerListQuery.CustomerListFilter;
                customerMaxReturned = customerFilter.MaxReturned;
                customerActiveStatus = customerFilter.ActiveStatus;
                ConfigureActiveFilter(customerMaxReturned, customerActiveStatus);

                salesTaxCodeQuery = requestSet.AppendSalesTaxCodeQueryRq();
                AddElements(salesTaxCodeQuery.IncludeRetElementList, "ListID", "Name", "IsTaxable");
                salesTaxCodeListQuery = salesTaxCodeQuery.ORListQuery;
                salesTaxCodeFilter = salesTaxCodeListQuery.ListFilter;
                salesTaxCodeMaxReturned = salesTaxCodeFilter.MaxReturned;
                salesTaxCodeActiveStatus = salesTaxCodeFilter.ActiveStatus;
                ConfigureActiveFilter(salesTaxCodeMaxReturned, salesTaxCodeActiveStatus);

                salesTaxItemQuery = requestSet.AppendItemSalesTaxQueryRq();
                AddElements(salesTaxItemQuery.IncludeRetElementList, "ListID", "Name", "TaxRate");
                salesTaxItemListQuery = salesTaxItemQuery.ORListQueryWithOwnerIDAndClass;
                salesTaxItemFilter = salesTaxItemListQuery.ListWithClassFilter;
                salesTaxItemMaxReturned = salesTaxItemFilter.MaxReturned;
                salesTaxItemActiveStatus = salesTaxItemFilter.ActiveStatus;
                ConfigureActiveFilter(salesTaxItemMaxReturned, salesTaxItemActiveStatus);

                paymentMethodQuery = requestSet.AppendPaymentMethodQueryRq();
                AddElements(paymentMethodQuery.IncludeRetElementList, "ListID", "Name", "PaymentMethodType");
                paymentMethodListQuery = paymentMethodQuery.ORPaymentMethodListQuery;
                paymentMethodFilter = paymentMethodListQuery.PaymentMethodListFilter;
                paymentMethodMaxReturned = paymentMethodFilter.MaxReturned;
                paymentMethodActiveStatus = paymentMethodFilter.ActiveStatus;
                ConfigureActiveFilter(paymentMethodMaxReturned, paymentMethodActiveStatus);

                accountQuery = requestSet.AppendAccountQueryRq();
                AddElements(accountQuery.IncludeRetElementList, "ListID", "Name", "FullName", "AccountType");
                accountListQuery = accountQuery.ORAccountListQuery;
                accountFilter = accountListQuery.AccountListFilter;
                accountMaxReturned = accountFilter.MaxReturned;
                accountActiveStatus = accountFilter.ActiveStatus;
                ConfigureActiveFilter(accountMaxReturned, accountActiveStatus);

                responseSet = manager.DoRequests(requestSet);
                responseList = responseSet.ResponseList;
                if (responseList.Count != 6)
                {
                    throw new QuickBooksBridgeException(
                        "CATALOG_QUERY_RESPONSE_INVALID",
                        "QuickBooks returned an unexpected catalog response count."
                    );
                }

                itemResponse = responseList.GetAt(0);
                customerResponse = responseList.GetAt(1);
                salesTaxCodeResponse = responseList.GetAt(2);
                salesTaxItemResponse = responseList.GetAt(3);
                paymentMethodResponse = responseList.GetAt(4);
                accountResponse = responseList.GetAt(5);

                items = GetDetail<IORItemRetList>(itemResponse, "ITEM_CATALOG_QUERY_FAILED");
                customers = GetDetail<ICustomerRetList>(customerResponse, "CUSTOMER_CATALOG_QUERY_FAILED");
                salesTaxCodes = GetDetail<ISalesTaxCodeRetList>(salesTaxCodeResponse, "SALES_TAX_CODE_QUERY_FAILED");
                salesTaxItems = GetDetail<IItemSalesTaxRetList>(salesTaxItemResponse, "SALES_TAX_ITEM_QUERY_FAILED");
                paymentMethods = GetDetail<IPaymentMethodRetList>(paymentMethodResponse, "PAYMENT_METHOD_QUERY_FAILED");
                accounts = GetDetail<IAccountRetList>(accountResponse, "ACCOUNT_CATALOG_QUERY_FAILED");

                QuickBooksCatalogsInfo result = new QuickBooksCatalogsInfo();
                result.Items.AddRange(ReadItems(items));
                result.Customers.AddRange(ReadCustomers(customers));
                result.SalesTaxCodes.AddRange(ReadSalesTaxCodes(salesTaxCodes));
                result.SalesTaxItems.AddRange(ReadSalesTaxItems(salesTaxItems));
                result.PaymentMethods.AddRange(ReadPaymentMethods(paymentMethods));
                result.Accounts.AddRange(ReadAccounts(accounts));
                result.ItemsTruncated = items != null && items.Count >= MaximumReturned;
                result.CustomersTruncated = customers != null && customers.Count >= MaximumReturned;
                result.SalesTaxCodesTruncated = salesTaxCodes != null && salesTaxCodes.Count >= MaximumReturned;
                result.SalesTaxItemsTruncated = salesTaxItems != null && salesTaxItems.Count >= MaximumReturned;
                result.PaymentMethodsTruncated = paymentMethods != null && paymentMethods.Count >= MaximumReturned;
                result.AccountsTruncated = accounts != null && accounts.Count >= MaximumReturned;
                return result;
            }
            catch (QuickBooksBridgeException)
            {
                throw;
            }
            catch (COMException error)
            {
                throw new QuickBooksBridgeException(
                    "QUICKBOOKS_COM_ERROR",
                    "HRESULT 0x" + error.ErrorCode.ToString("X8") + ": " + Program.Sanitize(error.Message)
                );
            }
            finally
            {
                QuickBooksBridgeException cleanupError = null;
                if (sessionBegun)
                {
                    try
                    {
                        manager.EndSession();
                    }
                    catch (COMException error)
                    {
                        cleanupError = new QuickBooksBridgeException(
                            "SESSION_CLOSE_ERROR",
                            "HRESULT 0x" + error.ErrorCode.ToString("X8")
                        );
                    }
                }

                if (connectionOpened)
                {
                    try
                    {
                        manager.CloseConnection();
                    }
                    catch (COMException error)
                    {
                        if (cleanupError == null)
                        {
                            cleanupError = new QuickBooksBridgeException(
                                "CONNECTION_CLOSE_ERROR",
                                "HRESULT 0x" + error.ErrorCode.ToString("X8")
                            );
                        }
                    }
                }

                ReleaseAll(
                    accounts,
                    paymentMethods,
                    salesTaxItems,
                    salesTaxCodes,
                    customers,
                    items,
                    accountResponse,
                    paymentMethodResponse,
                    salesTaxItemResponse,
                    salesTaxCodeResponse,
                    customerResponse,
                    itemResponse,
                    responseList,
                    responseSet,
                    accountActiveStatus,
                    accountMaxReturned,
                    accountFilter,
                    accountListQuery,
                    paymentMethodActiveStatus,
                    paymentMethodMaxReturned,
                    paymentMethodFilter,
                    paymentMethodListQuery,
                    salesTaxItemActiveStatus,
                    salesTaxItemMaxReturned,
                    salesTaxItemFilter,
                    salesTaxItemListQuery,
                    salesTaxCodeActiveStatus,
                    salesTaxCodeMaxReturned,
                    salesTaxCodeFilter,
                    salesTaxCodeListQuery,
                    customerActiveStatus,
                    customerMaxReturned,
                    customerFilter,
                    customerListQuery,
                    itemActiveStatus,
                    itemMaxReturned,
                    itemFilter,
                    itemListQuery,
                    accountQuery,
                    paymentMethodQuery,
                    salesTaxItemQuery,
                    salesTaxCodeQuery,
                    customerQuery,
                    itemQuery,
                    requestAttributes,
                    requestSet,
                    manager
                );
                if (cleanupError != null)
                {
                    throw cleanupError;
                }
            }
        }

        private static void ConfigureActiveFilter(IQBIntType maxReturned, IQBENActiveStatusType activeStatus)
        {
            maxReturned.SetValue(MaximumReturned);
            activeStatus.SetValue(ENActiveStatus.asActiveOnly);
        }

        private static void AddElements(IBSTRList elements, params string[] names)
        {
            foreach (string name in names)
            {
                elements.Add(name);
            }
        }

        private static T GetDetail<T>(IResponse response, string errorCode) where T : class
        {
            if (IsInformationalNoMatch(response))
            {
                return null;
            }
            if (response.StatusCode != 0)
            {
                throw new QuickBooksBridgeException(
                    errorCode,
                    "QuickBooks status " + response.StatusCode + " (" +
                    Program.Sanitize(response.StatusSeverity) + "): " +
                    Program.Sanitize(response.StatusMessage)
                );
            }

            T detail = response.Detail as T;
            if (detail == null)
            {
                throw new QuickBooksBridgeException(
                    errorCode,
                    "QuickBooks returned an unexpected catalog record type."
                );
            }
            return detail;
        }

        private static bool IsInformationalNoMatch(IResponse response)
        {
            return response.StatusCode == 1 &&
                String.Equals(response.StatusSeverity, "Info", StringComparison.OrdinalIgnoreCase);
        }

        private static List<QuickBooksCatalogEntry> ReadItems(IORItemRetList items)
        {
            List<QuickBooksCatalogEntry> result = new List<QuickBooksCatalogEntry>();
            if (items == null)
            {
                return result;
            }
            for (int index = 0; index < items.Count; index++)
            {
                IORItemRet item = items.GetAt(index);
                try
                {
                    QuickBooksCatalogEntry entry = ReadItem(item);
                    if (entry != null)
                    {
                        result.Add(entry);
                    }
                }
                finally
                {
                    ReleaseAll(item);
                }
            }
            return result;
        }

        private static QuickBooksCatalogEntry ReadItem(IORItemRet item)
        {
            switch (item.ortype)
            {
                case ENORItemRet.orirItemServiceRet:
                    IItemServiceRet service = item.ItemServiceRet;
                    return CreateItem(service, service.ListID, service.Name, service.FullName, "service", true);
                case ENORItemRet.orirItemNonInventoryRet:
                    IItemNonInventoryRet nonInventory = item.ItemNonInventoryRet;
                    return CreateItem(nonInventory, nonInventory.ListID, nonInventory.Name, nonInventory.FullName, "non_inventory", true);
                case ENORItemRet.orirItemOtherChargeRet:
                    IItemOtherChargeRet otherCharge = item.ItemOtherChargeRet;
                    return CreateItem(otherCharge, otherCharge.ListID, otherCharge.Name, otherCharge.FullName, "other_charge", true);
                case ENORItemRet.orirItemInventoryRet:
                    IItemInventoryRet inventory = item.ItemInventoryRet;
                    return ReadInventoryItem(inventory);
                case ENORItemRet.orirItemInventoryAssemblyRet:
                    IItemInventoryAssemblyRet assembly = item.ItemInventoryAssemblyRet;
                    return ReadInventoryAssembly(assembly);
                case ENORItemRet.orirItemGroupRet:
                    IItemGroupRet group = item.ItemGroupRet;
                    return CreateItem(group, group.ListID, group.Name, null, "group", true);
                case ENORItemRet.orirItemFixedAssetRet:
                case ENORItemRet.orirItemSubtotalRet:
                case ENORItemRet.orirItemDiscountRet:
                case ENORItemRet.orirItemPaymentRet:
                case ENORItemRet.orirItemSalesTaxRet:
                case ENORItemRet.orirItemSalesTaxGroupRet:
                    return null;
                default:
                    throw new QuickBooksBridgeException(
                        "CATALOG_QUERY_INCOMPLETE",
                        "QuickBooks returned an unsupported item record type."
                    );
            }
        }

        private static QuickBooksCatalogEntry ReadInventoryItem(IItemInventoryRet inventory)
        {
            IQBIDType listId = null;
            IQBStringType name = null;
            IQBStringType fullName = null;
            IQBQuanType quantityOnHand = null;
            IQBPriceType salesPrice = null;
            try
            {
                listId = inventory.ListID;
                name = inventory.Name;
                fullName = inventory.FullName;
                quantityOnHand = inventory.QuantityOnHand;
                salesPrice = inventory.SalesPrice;
                return CreateEntry(
                    listId,
                    name,
                    fullName,
                    "inventory",
                    true,
                    null,
                    null,
                    quantityOnHand != null && quantityOnHand.IsSet()
                        ? (double?)quantityOnHand.GetValue()
                        : null,
                    salesPrice != null && salesPrice.IsSet()
                        ? (double?)salesPrice.GetValue()
                        : null
                );
            }
            finally
            {
                ReleaseAll(salesPrice, quantityOnHand, fullName, name, listId, inventory);
            }
        }

        private static QuickBooksCatalogEntry ReadInventoryAssembly(IItemInventoryAssemblyRet assembly)
        {
            IQBIDType listId = null;
            IQBStringType name = null;
            IQBStringType fullName = null;
            IQBQuanType quantityOnHand = null;
            IQBPriceType salesPrice = null;
            try
            {
                listId = assembly.ListID;
                name = assembly.Name;
                fullName = assembly.FullName;
                quantityOnHand = assembly.QuantityOnHand;
                salesPrice = assembly.SalesPrice;
                return CreateEntry(
                    listId,
                    name,
                    fullName,
                    "inventory_assembly",
                    true,
                    null,
                    null,
                    quantityOnHand != null && quantityOnHand.IsSet()
                        ? (double?)quantityOnHand.GetValue()
                        : null,
                    salesPrice != null && salesPrice.IsSet()
                        ? (double?)salesPrice.GetValue()
                        : null
                );
            }
            finally
            {
                ReleaseAll(salesPrice, quantityOnHand, fullName, name, listId, assembly);
            }
        }

        private static QuickBooksCatalogEntry CreateItem(
            object item,
            IQBIDType listId,
            IQBStringType name,
            IQBStringType fullName,
            string type,
            bool isSalesItem
        )
        {
            try
            {
                return CreateEntry(listId, name, fullName, type, isSalesItem, null, null);
            }
            finally
            {
                ReleaseAll(fullName, name, listId, item);
            }
        }

        private static List<QuickBooksCatalogEntry> ReadCustomers(ICustomerRetList customers)
        {
            List<QuickBooksCatalogEntry> result = new List<QuickBooksCatalogEntry>();
            if (customers == null)
            {
                return result;
            }
            for (int index = 0; index < customers.Count; index++)
            {
                ICustomerRet customer = customers.GetAt(index);
                IQBIDType listId = null;
                IQBStringType name = null;
                IQBStringType fullName = null;
                try
                {
                    listId = customer.ListID;
                    name = customer.Name;
                    fullName = customer.FullName;
                    result.Add(CreateEntry(listId, name, fullName, "customer", false, null, null));
                }
                finally
                {
                    ReleaseAll(fullName, name, listId, customer);
                }
            }
            return result;
        }

        private static List<QuickBooksCatalogEntry> ReadSalesTaxCodes(ISalesTaxCodeRetList codes)
        {
            List<QuickBooksCatalogEntry> result = new List<QuickBooksCatalogEntry>();
            if (codes == null)
            {
                return result;
            }
            for (int index = 0; index < codes.Count; index++)
            {
                ISalesTaxCodeRet code = codes.GetAt(index);
                IQBIDType listId = null;
                IQBStringType name = null;
                IQBBoolType taxable = null;
                try
                {
                    listId = code.ListID;
                    name = code.Name;
                    taxable = code.IsTaxable;
                    result.Add(CreateEntry(
                        listId,
                        name,
                        null,
                        "sales_tax_code",
                        false,
                        taxable != null && taxable.IsSet() ? (bool?)taxable.GetValue() : null,
                        null
                    ));
                }
                finally
                {
                    ReleaseAll(taxable, name, listId, code);
                }
            }
            return result;
        }

        private static List<QuickBooksCatalogEntry> ReadSalesTaxItems(IItemSalesTaxRetList items)
        {
            List<QuickBooksCatalogEntry> result = new List<QuickBooksCatalogEntry>();
            if (items == null)
            {
                return result;
            }
            for (int index = 0; index < items.Count; index++)
            {
                IItemSalesTaxRet item = items.GetAt(index);
                IQBIDType listId = null;
                IQBStringType name = null;
                IQBPercentType rate = null;
                try
                {
                    listId = item.ListID;
                    name = item.Name;
                    rate = item.TaxRate;
                    result.Add(CreateEntry(
                        listId,
                        name,
                        null,
                        "sales_tax_item",
                        false,
                        null,
                        rate != null && rate.IsSet() ? (double?)rate.GetValue() : null
                    ));
                }
                finally
                {
                    ReleaseAll(rate, name, listId, item);
                }
            }
            return result;
        }

        private static List<QuickBooksCatalogEntry> ReadPaymentMethods(IPaymentMethodRetList methods)
        {
            List<QuickBooksCatalogEntry> result = new List<QuickBooksCatalogEntry>();
            if (methods == null)
            {
                return result;
            }
            for (int index = 0; index < methods.Count; index++)
            {
                IPaymentMethodRet method = methods.GetAt(index);
                IQBIDType listId = null;
                IQBStringType name = null;
                IQBENPaymentMethodTypeType type = null;
                try
                {
                    listId = method.ListID;
                    name = method.Name;
                    type = method.PaymentMethodType;
                    result.Add(CreateEntry(
                        listId,
                        name,
                        null,
                        type != null && type.IsSet() ? type.GetValue().ToString() : "payment_method",
                        false,
                        null,
                        null
                    ));
                }
                finally
                {
                    ReleaseAll(type, name, listId, method);
                }
            }
            return result;
        }

        private static List<QuickBooksCatalogEntry> ReadAccounts(IAccountRetList accounts)
        {
            List<QuickBooksCatalogEntry> result = new List<QuickBooksCatalogEntry>();
            if (accounts == null)
            {
                return result;
            }
            for (int index = 0; index < accounts.Count; index++)
            {
                IAccountRet account = accounts.GetAt(index);
                IQBIDType listId = null;
                IQBStringType name = null;
                IQBStringType fullName = null;
                IQBENAccountTypeType type = null;
                try
                {
                    listId = account.ListID;
                    name = account.Name;
                    fullName = account.FullName;
                    type = account.AccountType;
                    result.Add(CreateEntry(
                        listId,
                        name,
                        fullName,
                        type != null && type.IsSet() ? type.GetValue().ToString() : "account",
                        false,
                        null,
                        null
                    ));
                }
                finally
                {
                    ReleaseAll(type, fullName, name, listId, account);
                }
            }
            return result;
        }

        private static QuickBooksCatalogEntry CreateEntry(
            IQBIDType listId,
            IQBStringType name,
            IQBStringType fullName,
            string type,
            bool isSalesItem,
            bool? isTaxable,
            double? taxRate,
            double? quantityOnHand = null,
            double? salesPrice = null
        )
        {
            string listIdValue = GetRequiredValue(listId, "ListID");
            string nameValue = GetOptionalValue(name);
            string fullNameValue = GetOptionalValue(fullName);
            string displayName = String.IsNullOrWhiteSpace(fullNameValue) ? nameValue : fullNameValue;
            if (String.IsNullOrWhiteSpace(displayName))
            {
                throw new QuickBooksBridgeException(
                    "CATALOG_QUERY_INCOMPLETE",
                    "QuickBooks returned an active catalog record without a display name."
                );
            }

            return new QuickBooksCatalogEntry(
                listIdValue,
                nameValue,
                String.IsNullOrWhiteSpace(fullNameValue) ? null : fullNameValue,
                type,
                isSalesItem,
                isTaxable,
                taxRate,
                quantityOnHand,
                salesPrice
            );
        }

        private static string GetRequiredValue(IQBIDType value, string fieldName)
        {
            if (value == null || !value.IsSet() || String.IsNullOrWhiteSpace(value.GetValue()))
            {
                throw new QuickBooksBridgeException(
                    "CATALOG_QUERY_INCOMPLETE",
                    "QuickBooks returned an active catalog record without " + fieldName + "."
                );
            }
            return value.GetValue();
        }

        private static string GetOptionalValue(IQBStringType value)
        {
            return value != null && value.IsSet() ? value.GetValue() : null;
        }

        private static void ReleaseAll(params object[] values)
        {
            foreach (object value in values)
            {
                if (value != null && Marshal.IsComObject(value))
                {
                    Marshal.FinalReleaseComObject(value);
                }
            }
        }
    }
}
