export class FaceGenerator {
    static createTexture(type) {
        const canvas = document.createElement('canvas');
        canvas.width = 128;
        canvas.height = 128;
        const ctx = canvas.getContext('2d');

        // Background (Skin Color)
        ctx.fillStyle = '#ffcd03'; // Lego Yellow
        ctx.fillRect(0, 0, 128, 128);

        // Common settings
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        switch (type) {
            case 'happy':
                this.drawHappy(ctx);
                break;
            case 'angry':
                this.drawAngry(ctx);
                break;
            case 'cool':
                this.drawCool(ctx);
                break;
            case 'shocked':
                this.drawShocked(ctx);
                break;
        }

        return canvas;
    }

    static drawHappy(ctx) {
        // Eyes
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(40, 50, 8, 0, Math.PI * 2); // Left Eye
        ctx.arc(88, 50, 8, 0, Math.PI * 2); // Right Eye
        ctx.fill();

        // Smile
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(64, 60, 30, 0.2 * Math.PI, 0.8 * Math.PI);
        ctx.stroke();
    }

    static drawAngry(ctx) {
        // Brows
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 8;
        ctx.beginPath();
        ctx.moveTo(30, 45);
        ctx.lineTo(60, 60); // Left Brow
        ctx.moveTo(98, 45);
        ctx.lineTo(68, 60); // Right Brow
        ctx.stroke();

        // Eyes
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(45, 65, 6, 0, Math.PI * 2);
        ctx.arc(83, 65, 6, 0, Math.PI * 2);
        ctx.fill();

        // Mouth (Frown)
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(64, 100, 20, 1.2 * Math.PI, 1.8 * Math.PI);
        ctx.stroke();
    }

    static drawCool(ctx) {
        // Sunglasses
        ctx.fillStyle = 'black';
        // Left Lens
        ctx.fillRect(20, 40, 42, 25);
        // Right Lens
        ctx.fillRect(66, 40, 42, 25);
        // Bridge
        ctx.fillRect(62, 45, 10, 5);

        // Smile (Smirk)
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(50, 90);
        ctx.quadraticCurveTo(70, 100, 90, 85);
        ctx.stroke();
    }

    static drawShocked(ctx) {
        // Eyes
        ctx.fillStyle = 'black';
        ctx.beginPath();
        ctx.arc(40, 50, 10, 0, Math.PI * 2);
        ctx.arc(88, 50, 10, 0, Math.PI * 2);
        ctx.fill();

        // Mouth (O)
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(64, 85, 15, 0, Math.PI * 2);
        ctx.stroke();
    }
}
