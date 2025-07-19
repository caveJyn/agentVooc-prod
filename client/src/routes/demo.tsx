import Navbar from "@/components/navbar";

export default function Demo() {

    return(
        <div className="min-h-screen bg-agentvooc-secondary-bg dark:bg-agentvooc-secondary-bg">
            <Navbar />
        <div className="flex flex-col items-center justify-center h-screen">
            
            <h1 className="text-4xl font-bold mb-4">Demo Page</h1>
            <p className="text-lg text-gray-600">we will release one soon.</p>
        </div> 
        </div>
    )
}