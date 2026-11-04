import { OrderDetail } from "@/components/OrdersView";
export default function Page({ params }: { params: { id: string } }) { return <OrderDetail id={params.id} />; }
