using System;
using System.Globalization;
using System.Runtime.InteropServices;
using Interop.QBFC18;

namespace LibraryPos.QuickBooksBridge
{
    internal sealed class QuickBooksMasterDataResult
    {
        internal QuickBooksMasterDataResult(string listId, string name)
        {
            ListId = listId;
            Name = name;
        }

        internal string ListId { get; private set; }
        internal string Name { get; private set; }
    }

    internal static class QuickBooksMasterData
    {
        private const string ApplicationName = "Library POS QuickBooks Bridge";

        internal static QuickBooksMasterDataResult AddCustomer(
            string sdkCountry,
            string name,
            string email,
            string phone,
            string address
        )
        {
            QBSessionManagerClass manager = null;
            IMsgSetRequest requestSet = null;
            IAttributesRqSet requestAttributes = null;
            ICustomerAdd customerAdd = null;
            IAddress billAddress = null;
            IMsgSetResponse responseSet = null;
            IResponseList responseList = null;
            IResponse response = null;
            ICustomerRet customer = null;
            IQBIDType listId = null;
            IQBStringType returnedName = null;
            bool connectionOpened = false;
            bool sessionBegun = false;

            try
            {
                short majorVersion;
                short minorVersion;
                manager = OpenSession(sdkCountry, out connectionOpened, out sessionBegun, out majorVersion, out minorVersion);
                requestSet = CreateRequestSet(manager, sdkCountry, majorVersion, minorVersion, out requestAttributes);
                customerAdd = requestSet.AppendCustomerAddRq();
                customerAdd.Name.SetValue(name);
                SetOptional(customerAdd.Email, email);
                SetOptional(customerAdd.Phone, phone);
                billAddress = customerAdd.BillAddress;
                SetAddress(billAddress, address);

                responseSet = manager.DoRequests(requestSet);
                responseList = responseSet.ResponseList;
                response = RequireOneResponse(responseList, "CUSTOMER_ADD_RESPONSE_INVALID");
                customer = response.Detail as ICustomerRet;
                if (response.StatusCode != 0 || customer == null)
                {
                    throw ResponseFailure(response, "CUSTOMER_ADD_FAILED");
                }

                listId = customer.ListID;
                returnedName = customer.Name;
                return new QuickBooksMasterDataResult(
                    RequiredValue(listId, "ListID"),
                    OptionalValue(returnedName) ?? name
                );
            }
            catch (QuickBooksBridgeException)
            {
                throw;
            }
            catch (COMException error)
            {
                throw ComFailure(error);
            }
            finally
            {
                QuickBooksBridgeException cleanupError = CloseSession(manager, connectionOpened, sessionBegun);
                ReleaseAll(returnedName, listId, customer, response, responseList, responseSet, billAddress, customerAdd, requestAttributes, requestSet, manager);
                if (cleanupError != null) throw cleanupError;
            }
        }

        internal static QuickBooksMasterDataResult UpdateCustomer(
            string sdkCountry,
            string listIdValue,
            string name,
            string email,
            string phone,
            string address
        )
        {
            QBSessionManagerClass manager = null;
            IMsgSetRequest queryRequestSet = null;
            IAttributesRqSet queryRequestAttributes = null;
            ICustomerQuery customerQuery = null;
            IORCustomerListQuery customerListQuery = null;
            IBSTRList customerListIds = null;
            IMsgSetResponse queryResponseSet = null;
            IResponseList queryResponseList = null;
            IResponse queryResponse = null;
            ICustomerRetList customers = null;
            ICustomerRet existingCustomer = null;
            IQBStringType editSequence = null;
            IMsgSetRequest modRequestSet = null;
            IAttributesRqSet modRequestAttributes = null;
            ICustomerMod customerMod = null;
            IQBIDType modListId = null;
            IQBStringType modEditSequence = null;
            IQBStringType modName = null;
            IQBStringType modEmail = null;
            IQBStringType modPhone = null;
            IAddress modAddress = null;
            IMsgSetResponse modResponseSet = null;
            IResponseList modResponseList = null;
            IResponse modResponse = null;
            ICustomerRet updatedCustomer = null;
            IQBIDType updatedListId = null;
            IQBStringType updatedName = null;
            bool connectionOpened = false;
            bool sessionBegun = false;

            try
            {
                short majorVersion;
                short minorVersion;
                manager = OpenSession(sdkCountry, out connectionOpened, out sessionBegun, out majorVersion, out minorVersion);

                queryRequestSet = CreateRequestSet(manager, sdkCountry, majorVersion, minorVersion, out queryRequestAttributes);
                customerQuery = queryRequestSet.AppendCustomerQueryRq();
                customerQuery.IncludeRetElementList.Add("ListID");
                customerQuery.IncludeRetElementList.Add("EditSequence");
                customerQuery.IncludeRetElementList.Add("Name");
                customerListQuery = customerQuery.ORCustomerListQuery;
                customerListIds = customerListQuery.ListIDList;
                customerListIds.Add(listIdValue);

                queryResponseSet = manager.DoRequests(queryRequestSet);
                queryResponseList = queryResponseSet.ResponseList;
                queryResponse = RequireOneResponse(queryResponseList, "CUSTOMER_QUERY_RESPONSE_INVALID");
                if (IsInformationalNoMatch(queryResponse))
                {
                    throw new QuickBooksBridgeException("CUSTOMER_NOT_FOUND", "The mapped QuickBooks customer was not found.", 404);
                }
                customers = RequireDetail<ICustomerRetList>(queryResponse, "CUSTOMER_QUERY_FAILED");
                if (customers.Count != 1)
                {
                    throw new QuickBooksBridgeException("CUSTOMER_QUERY_AMBIGUOUS", "QuickBooks did not return exactly one mapped customer.", 409);
                }

                existingCustomer = customers.GetAt(0);
                editSequence = existingCustomer.EditSequence;
                if (editSequence == null || !editSequence.IsSet())
                {
                    throw new QuickBooksBridgeException("CUSTOMER_QUERY_INCOMPLETE", "QuickBooks did not return an edit sequence for the customer.");
                }

                modRequestSet = CreateRequestSet(manager, sdkCountry, majorVersion, minorVersion, out modRequestAttributes);
                customerMod = modRequestSet.AppendCustomerModRq();
                modListId = customerMod.ListID;
                modListId.SetValue(listIdValue);
                modEditSequence = customerMod.EditSequence;
                modEditSequence.SetValue(editSequence.GetValue());
                modName = customerMod.Name;
                modName.SetValue(name);
                modEmail = customerMod.Email;
                SetOptional(modEmail, email);
                modPhone = customerMod.Phone;
                SetOptional(modPhone, phone);
                modAddress = customerMod.BillAddress;
                SetAddress(modAddress, address);

                modResponseSet = manager.DoRequests(modRequestSet);
                modResponseList = modResponseSet.ResponseList;
                modResponse = RequireOneResponse(modResponseList, "CUSTOMER_MOD_RESPONSE_INVALID");
                if (modResponse.StatusCode != 0)
                {
                    throw ResponseFailure(modResponse, "CUSTOMER_MOD_FAILED");
                }

                updatedCustomer = modResponse.Detail as ICustomerRet;
                if (updatedCustomer == null)
                {
                    return new QuickBooksMasterDataResult(listIdValue, name);
                }
                updatedListId = updatedCustomer.ListID;
                updatedName = updatedCustomer.Name;
                return new QuickBooksMasterDataResult(
                    OptionalValue(updatedListId) ?? listIdValue,
                    OptionalValue(updatedName) ?? name
                );
            }
            catch (QuickBooksBridgeException)
            {
                throw;
            }
            catch (COMException error)
            {
                throw ComFailure(error);
            }
            finally
            {
                QuickBooksBridgeException cleanupError = CloseSession(manager, connectionOpened, sessionBegun);
                ReleaseAll(
                    updatedName, updatedListId, updatedCustomer, modResponse, modResponseList, modResponseSet,
                    modAddress, modPhone, modEmail, modName, modEditSequence, modListId, customerMod,
                    modRequestAttributes, modRequestSet,
                    editSequence, existingCustomer, customers, queryResponse, queryResponseList, queryResponseSet,
                    customerListIds, customerListQuery, customerQuery, queryRequestAttributes, queryRequestSet, manager
                );
                if (cleanupError != null) throw cleanupError;
            }
        }

        internal static QuickBooksMasterDataResult UpdateInventoryItem(
            string sdkCountry,
            string listIdValue,
            string name,
            double salesPriceValue
        )
        {
            QBSessionManagerClass manager = null;
            IMsgSetRequest queryRequestSet = null;
            IAttributesRqSet queryRequestAttributes = null;
            IItemQuery itemQuery = null;
            IORListQuery itemListQuery = null;
            IBSTRList itemListIds = null;
            IMsgSetResponse queryResponseSet = null;
            IResponseList queryResponseList = null;
            IResponse queryResponse = null;
            IORItemRetList items = null;
            IORItemRet item = null;
            IItemInventoryRet inventory = null;
            IItemInventoryAssemblyRet assembly = null;
            IQBStringType editSequence = null;
            IMsgSetRequest modRequestSet = null;
            IAttributesRqSet modRequestAttributes = null;
            IMsgSetResponse modResponseSet = null;
            IResponseList modResponseList = null;
            IResponse modResponse = null;
            string returnedName = name;
            bool connectionOpened = false;
            bool sessionBegun = false;

            try
            {
                short majorVersion;
                short minorVersion;
                manager = OpenSession(sdkCountry, out connectionOpened, out sessionBegun, out majorVersion, out minorVersion);

                queryRequestSet = CreateRequestSet(manager, sdkCountry, majorVersion, minorVersion, out queryRequestAttributes);
                itemQuery = queryRequestSet.AppendItemQueryRq();
                itemQuery.IncludeRetElementList.Add("ListID");
                itemQuery.IncludeRetElementList.Add("EditSequence");
                itemQuery.IncludeRetElementList.Add("Name");
                itemListQuery = itemQuery.ORListQuery;
                itemListIds = itemListQuery.ListIDList;
                itemListIds.Add(listIdValue);

                queryResponseSet = manager.DoRequests(queryRequestSet);
                queryResponseList = queryResponseSet.ResponseList;
                queryResponse = RequireOneResponse(queryResponseList, "ITEM_QUERY_RESPONSE_INVALID");
                if (IsInformationalNoMatch(queryResponse))
                {
                    throw new QuickBooksBridgeException("ITEM_NOT_FOUND", "The mapped QuickBooks item was not found.", 404);
                }
                items = RequireDetail<IORItemRetList>(queryResponse, "ITEM_QUERY_FAILED");
                if (items.Count != 1)
                {
                    throw new QuickBooksBridgeException("ITEM_QUERY_AMBIGUOUS", "QuickBooks did not return exactly one mapped item.");
                }

                item = items.GetAt(0);
                modRequestSet = CreateRequestSet(manager, sdkCountry, majorVersion, minorVersion, out modRequestAttributes);
                if (item.ortype == ENORItemRet.orirItemInventoryRet)
                {
                    inventory = item.ItemInventoryRet;
                    editSequence = inventory.EditSequence;
                    IItemInventoryMod itemMod = modRequestSet.AppendItemInventoryModRq();
                    itemMod.ListID.SetValue(listIdValue);
                    itemMod.EditSequence.SetValue(RequiredValue(editSequence, "EditSequence"));
                    itemMod.Name.SetValue(name);
                    itemMod.SalesPrice.SetValue(salesPriceValue);
                }
                else if (item.ortype == ENORItemRet.orirItemInventoryAssemblyRet)
                {
                    assembly = item.ItemInventoryAssemblyRet;
                    editSequence = assembly.EditSequence;
                    IItemInventoryAssemblyMod itemMod = modRequestSet.AppendItemInventoryAssemblyModRq();
                    itemMod.ListID.SetValue(listIdValue);
                    itemMod.EditSequence.SetValue(RequiredValue(editSequence, "EditSequence"));
                    itemMod.Name.SetValue(name);
                    itemMod.SalesPrice.SetValue(salesPriceValue);
                }
                else
                {
                    throw new QuickBooksBridgeException(
                        "ITEM_TYPE_NOT_SUPPORTED",
                        "Only QuickBooks inventory and inventory-assembly items can be updated from POS.",
                        409
                    );
                }

                modResponseSet = manager.DoRequests(modRequestSet);
                modResponseList = modResponseSet.ResponseList;
                modResponse = RequireOneResponse(modResponseList, "ITEM_MOD_RESPONSE_INVALID");
                if (modResponse.StatusCode != 0)
                {
                    throw ResponseFailure(modResponse, "ITEM_MOD_FAILED");
                }

                return new QuickBooksMasterDataResult(listIdValue, returnedName);
            }
            catch (QuickBooksBridgeException)
            {
                throw;
            }
            catch (COMException error)
            {
                throw ComFailure(error);
            }
            finally
            {
                QuickBooksBridgeException cleanupError = CloseSession(manager, connectionOpened, sessionBegun);
                ReleaseAll(
                    modResponse, modResponseList, modResponseSet, modRequestAttributes, modRequestSet,
                    editSequence, assembly, inventory, item, items, queryResponse, queryResponseList,
                    queryResponseSet, itemListIds, itemListQuery, itemQuery, queryRequestAttributes,
                    queryRequestSet, manager
                );
                if (cleanupError != null) throw cleanupError;
            }
        }

        private static QBSessionManagerClass OpenSession(
            string sdkCountry,
            out bool connectionOpened,
            out bool sessionBegun,
            out short majorVersion,
            out short minorVersion
        )
        {
            connectionOpened = false;
            sessionBegun = false;
            majorVersion = 0;
            minorVersion = 0;
            QBSessionManagerClass manager = new QBSessionManagerClass();
            try
            {
                manager.OpenConnection2("", ApplicationName, ENConnectionType.ctLocalQBD);
                connectionOpened = true;
                manager.BeginSession("", ENOpenMode.omDontCare);
                sessionBegun = true;
                string version = QuickBooksCompanyQuery.SelectSupportedQbxmlVersion(
                    manager.QBXMLVersionsForSession,
                    out majorVersion,
                    out minorVersion
                );
                if (version == null)
                {
                    throw new QuickBooksBridgeException("QBXML_VERSION_UNSUPPORTED", "QuickBooks did not report a usable qbXML version.");
                }
                return manager;
            }
            catch
            {
                QuickBooksBridgeException cleanupError = CloseSession(manager, connectionOpened, sessionBegun);
                ReleaseAll(manager);
                if (cleanupError != null) throw cleanupError;
                throw;
            }
        }

        private static IMsgSetRequest CreateRequestSet(
            QBSessionManagerClass manager,
            string sdkCountry,
            short majorVersion,
            short minorVersion,
            out IAttributesRqSet attributes
        )
        {
            IMsgSetRequest request = manager.CreateMsgSetRequest(
                sdkCountry.ToUpperInvariant(),
                majorVersion,
                minorVersion
            );
            attributes = request.Attributes;
            attributes.OnError = ENRqOnError.roeStop;
            return request;
        }

        private static IResponse RequireOneResponse(IResponseList responses, string errorCode)
        {
            if (responses == null || responses.Count != 1)
            {
                throw new QuickBooksBridgeException(errorCode, "QuickBooks returned an unexpected response count.");
            }
            return responses.GetAt(0);
        }

        private static T RequireDetail<T>(IResponse response, string errorCode) where T : class
        {
            if (response.StatusCode != 0)
            {
                throw ResponseFailure(response, errorCode);
            }
            T detail = response.Detail as T;
            if (detail == null)
            {
                throw new QuickBooksBridgeException(errorCode, "QuickBooks returned an unexpected response type.");
            }
            return detail;
        }

        private static QuickBooksBridgeException ResponseFailure(IResponse response, string errorCode)
        {
            return new QuickBooksBridgeException(
                errorCode,
                "QuickBooks status " + response.StatusCode + " (" +
                Program.Sanitize(response.StatusSeverity) + "): " +
                Program.Sanitize(response.StatusMessage)
            );
        }

        private static bool IsInformationalNoMatch(IResponse response)
        {
            return response.StatusCode == 1 &&
                String.Equals(response.StatusSeverity, "Info", StringComparison.OrdinalIgnoreCase);
        }

        private static void SetOptional(IQBStringType field, string value)
        {
            if (field != null)
            {
                field.SetValue(value ?? "");
            }
        }

        private static void SetAddress(IAddress address, string value)
        {
            if (address == null)
            {
                return;
            }

            IQBStringType[] fields = {
                address.Addr1, address.Addr2, address.Addr3, address.Addr4, address.Addr5,
            };
            try
            {
                if (String.IsNullOrWhiteSpace(value))
                {
                    foreach (IQBStringType field in fields)
                    {
                        field.SetValue("");
                    }
                    return;
                }

                string[] parts = new string[fields.Length];
                int fieldIndex = 0;
                int fieldLength = 0;
                TextElementEnumerator elements = StringInfo.GetTextElementEnumerator(value.Trim());
                while (elements.MoveNext())
                {
                    string element = elements.GetTextElement();
                    if (fieldIndex >= fields.Length)
                    {
                        throw new QuickBooksBridgeException(
                            "INVALID_MASTER_DATA",
                            "The customer address is too long for QuickBooks.",
                            400
                        );
                    }
                    if (fieldLength + element.Length > 41)
                    {
                        fieldIndex++;
                        fieldLength = 0;
                        if (fieldIndex >= fields.Length)
                        {
                            throw new QuickBooksBridgeException(
                                "INVALID_MASTER_DATA",
                                "The customer address is too long for QuickBooks.",
                                400
                            );
                        }
                    }
                    parts[fieldIndex] += element;
                    fieldLength += element.Length;
                }

                for (int index = 0; index < fields.Length; index++)
                {
                    if (!String.IsNullOrEmpty(parts[index]))
                    {
                        fields[index].SetValue(parts[index]);
                    }
                }
            }
            finally
            {
                ReleaseAll(fields);
            }
        }

        private static string RequiredValue(IQBStringType value, string fieldName)
        {
            if (value == null || !value.IsSet() || String.IsNullOrWhiteSpace(value.GetValue()))
            {
                throw new QuickBooksBridgeException("QUICKBOOKS_RESPONSE_INCOMPLETE", "QuickBooks did not return " + fieldName + ".");
            }
            return value.GetValue();
        }

        private static string RequiredValue(IQBIDType value, string fieldName)
        {
            if (value == null || !value.IsSet() || String.IsNullOrWhiteSpace(value.GetValue()))
            {
                throw new QuickBooksBridgeException("QUICKBOOKS_RESPONSE_INCOMPLETE", "QuickBooks did not return " + fieldName + ".");
            }
            return value.GetValue();
        }

        private static string OptionalValue(IQBStringType value)
        {
            return value != null && value.IsSet() ? value.GetValue() : null;
        }

        private static string OptionalValue(IQBIDType value)
        {
            return value != null && value.IsSet() ? value.GetValue() : null;
        }

        private static QuickBooksBridgeException ComFailure(COMException error)
        {
            return new QuickBooksBridgeException(
                "QUICKBOOKS_COM_ERROR",
                "HRESULT 0x" + error.ErrorCode.ToString("X8") + ": " + Program.Sanitize(error.Message)
            );
        }

        private static QuickBooksBridgeException CloseSession(
            QBSessionManagerClass manager,
            bool connectionOpened,
            bool sessionBegun
        )
        {
            if (manager == null)
            {
                return null;
            }
            QuickBooksBridgeException cleanupError = null;
            if (sessionBegun)
            {
                try { manager.EndSession(); }
                catch (COMException error) { cleanupError = ComFailure(error); }
            }
            if (connectionOpened)
            {
                try { manager.CloseConnection(); }
                catch (COMException error)
                {
                    if (cleanupError == null) cleanupError = ComFailure(error);
                }
            }
            return cleanupError;
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
