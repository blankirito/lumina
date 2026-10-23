import SuccessHeader from "@/components/ordersuccess/SuccessHeader";
import SuccessIcon from "@/components/ordersuccess/SuccessIcon";
import OrderDetails from "@/components/ordersuccess/OrderDetail";
import SuccessActions from "@/components/ordersuccess/SuccessActions";
import Recommendation from "@/components/ordersuccess/Recommendation";
import RightFooter from "@/components/shared/RightFooter";

export default function OrderSuccessPage(){

    return (
        <main
            className="
                min-h-screen
                bg-background
            "
        >
            <SuccessHeader />
            <div
                className="
                    flex
                    justify-center
                    px-5
                    py-10
                "
            >
                <div
                    className="
                        max-w-xl
                        w-full
                        text-center
                        space-y-6
                    "
                >
                    <SuccessIcon />
                    <div>
                        <h1
                            className="
                                text-4xl
                                font-display
                                text-primary
                            "
                        >
                            Order Placed Successfully!
                        </h1>
                        <p
                            className="
                                mt-4
                                text-on-surface-variant
                            "
                        >
                            Your items are being prepared for shipment.
                            We&apos;ve sent a confirmation email to your registered address.
                        </p>
                    </div>
                    <OrderDetails />
                    <SuccessActions />
                    <Recommendation />
                </div>
            </div>
            <RightFooter />
        </main>
    )
}