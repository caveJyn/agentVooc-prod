// test-resend.ts
import { Resend } from 'resend';

const resend = new Resend('re_T7djAX3A_6vPAgSpZDiU6B9uhzhR7M3PU');

async function testSend() {
    try {
        const response = await resend.emails.send({
            from: 'onboarding@resend.dev',
            to: 'miral.nadeem@gmail.com',
            subject: 'Test Email',
            html: '<p>Test email from Resend</p>'
        });
        console.log('Response:', JSON.stringify(response, null, 2));
    } catch (error) {
        console.error('Error:', error);
    }
}

testSend();