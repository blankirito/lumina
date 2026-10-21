import { expect, it, vi } from "vitest";
vi.mock("@/lib/storefront/getPublicStorefront",()=>({getPublicStorefront:async()=>null}));
vi.mock("@/lib/supabase/server",()=>({createClient:vi.fn(()=>{throw new Error("Private store data must not be queried");})}));
vi.mock("@/components/storefront/StorefrontCheckoutPage",()=>({default:()=>null}));
import CheckoutRoute from "./page";
it("keeps recovery reachable when the storefront is no longer eligible",async()=>{
 const page=await CheckoutRoute({params:Promise.resolve({slug:"synthetic"})});
 expect(page.props).toMatchObject({recoveryOnly:true,storeSlug:"synthetic",storeId:"",paymentMethods:[]});
});
