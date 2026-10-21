import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({rpc:vi.fn(),getUser:vi.fn()}));
vi.mock("@/lib/supabase/service",()=>({createServiceClient:()=>({rpc:mocks.rpc})}));
vi.mock("@/lib/supabase/server",()=>({createClient:async()=>({auth:{getUser:mocks.getUser}})}));
import { submitGuestCheckout } from "./actions";
const request={storeSlug:"synthetic",customerName:"Synthetic",customerEmail:"test@example.invalid",customerPhone:"000",addressLine1:"Do not ship",addressLine2:"",city:"Test",state:"Test",postalCode:"000",country:"Test",paymentMethodId:"method",items:[{productId:"product",quantity:1}]};
describe("checkout uncertain outcomes",()=>{
 beforeEach(()=>{vi.resetAllMocks();mocks.getUser.mockResolvedValue({data:{user:null},error:null});});
 it("requires a private attempt key before touching the database",async()=>{
  const result=await submitGuestCheckout(request,"");
  expect(result.status).toBe("error"); expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("does not discard an existing key because a retry has invalid local details",async()=>{
  const result=await submitGuestCheckout({...request,items:[]},"a".repeat(64));
  expect(result).toMatchObject({status:"error",retryable:true});expect(mocks.rpc).not.toHaveBeenCalled();
 });
 it("returns safe unknown outcome after a transport error without leaking credentials",async()=>{
  mocks.rpc.mockRejectedValue(new Error("sensitive transport detail"));
  const result=await submitGuestCheckout(request,"a".repeat(64));
  expect(result).toMatchObject({status:"error",retryable:true});
  expect(JSON.stringify(result)).not.toContain("sensitive");
 });
 it("uses the trusted customer identity and atomic replay RPC",async()=>{
  mocks.getUser.mockResolvedValue({data:{user:{id:"trusted-customer"}},error:null});
  mocks.rpc.mockResolvedValue({data:[{order_id:"same",order_number:"SYN",tracking_token:"private",payment_method_label:"Test",payment_instructions:"Do not pay"}],error:null});
  expect((await submitGuestCheckout(request,"a".repeat(64))).status).toBe("success");
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith("create_checkout_order_idempotent",expect.objectContaining({p_attempt_key:"a".repeat(64),p_customer_id:"trusted-customer"}));
 });
 it("does not downgrade an authentication outage to guest checkout",async()=>{
  mocks.getUser.mockResolvedValue({data:{user:null},error:{name:"AuthRetryableFetchError"}});
  const result=await submitGuestCheckout(request,"a".repeat(64));
  expect(result).toMatchObject({status:"error",retryable:true});expect(mocks.rpc).not.toHaveBeenCalled();
 });
});
