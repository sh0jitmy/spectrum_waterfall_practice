/*
 * Copyright (c) 2019 Jeppe Ledet-Pedersen
 * This software is released under the MIT license.
 * See the LICENSE file for further details.
 */

'use strict';

Spectrum.prototype.squeeze = function(value, out_min, out_max) {
    if (value <= this.min_db)
        return out_min;
    else if (value >= this.max_db)
        return out_max;
    else
        return Math.round((value - this.min_db) / (this.max_db - this.min_db) * out_max);
}

Spectrum.prototype.rowToImageData = function(bins) {
    for (var i = 0; i < this.imagedata.data.length; i += 4) {
        var cindex = this.squeeze(bins[i/4], 0, 255);
        var color = this.colormap[cindex];
        this.imagedata.data[i+0] = color[0];
        this.imagedata.data[i+1] = color[1];
        this.imagedata.data[i+2] = color[2];
        this.imagedata.data[i+3] = 255;
    }
}

Spectrum.prototype.addWaterfallRow = function(bins) {
    // Shift waterfall 1 row down
    this.ctx_wf.drawImage(this.ctx_wf.canvas,
        0, 0, this.wf_size, this.wf_rows - 1,
        0, 1, this.wf_size, this.wf_rows - 1);

    // Draw new line on waterfall canvas
    this.rowToImageData(bins);
    this.ctx_wf.putImageData(this.imagedata, 0, 0);

    var width = this.ctx.canvas.width;
    var height = this.ctx.canvas.height;

    // Copy scaled FFT canvas to screen. Only copy the number of rows that will
    // fit in waterfall area to avoid vertical scaling.
    this.ctx.imageSmoothingEnabled = false;
    var rows = Math.min(this.wf_rows, height - this.spectrumHeight);
    this.ctx.drawImage(this.ctx_wf.canvas,
        0, 0, this.wf_size, rows,
        0, this.spectrumHeight, width, height - this.spectrumHeight);
}

Spectrum.prototype.drawFFT = function(bins) {
    this.ctx.beginPath();
    this.ctx.moveTo(-1, this.spectrumHeight + 1);
    for (var i = 0; i < bins.length; i++) {
        var y = this.spectrumHeight - this.squeeze(bins[i], 0, this.spectrumHeight);
        if (y > this.spectrumHeight - 1)
            y = this.spectrumHeight + 1; // Hide underflow
        if (y < 0)
            y = 0;
        if (i == 0)
            this.ctx.lineTo(-1, y);
        this.ctx.lineTo(i, y);
        if (i == bins.length - 1)
            this.ctx.lineTo(this.wf_size + 1, y);
    }
    this.ctx.lineTo(this.wf_size + 1, this.spectrumHeight + 1);
    this.ctx.strokeStyle = "#fefefe";
    this.ctx.stroke();
}

Spectrum.prototype.drawSpectrum = function(bins) {
    var width = this.ctx.canvas.width;
    var height = this.ctx.canvas.height;

    //console.log("draw sp")
    //console.log(bins)

    // Fill with black
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, width, height);

    // FFT averaging
    if (this.averaging > 0) {
        if (!this.binsAverage || this.binsAverage.length != bins.length) {
            this.binsAverage = Array.from(bins);
        } else {
            for (var i = 0; i < bins.length; i++) {
                this.binsAverage[i] += this.alpha * (bins[i] - this.binsAverage[i]);
            }
        }
        bins = this.binsAverage;
    }

    // Max hold
    if (this.maxHold) {
        if (!this.binsMax || this.binsMax.length != bins.length) {
            this.binsMax = Array.from(bins);
        } else {
            for (var i = 0; i < bins.length; i++) {
                if (bins[i] > this.binsMax[i]) {
                    this.binsMax[i] = bins[i];
                } else {
                    // Decay
                    this.binsMax[i] = 1.0025 * this.binsMax[i];
                }
            }
        }
    }

    // Do not draw anything if spectrum is not visible
    if (this.ctx_axes.canvas.height < 1)
        return;

    // Scale for FFT
    this.ctx.save();
    this.ctx.scale(width / this.wf_size, 1);

    // Draw maxhold
    if (this.maxHold)
        this.drawFFT(this.binsMax);

    // Draw FFT bins
    this.drawFFT(bins);

    // Restore scale
    this.ctx.restore();

    // Fill scaled path
    this.ctx.fillStyle = this.gradient;
    this.ctx.fill();

    // Copy axes from offscreen canvas
    this.ctx.drawImage(this.ctx_axes.canvas, 0, 0);

    //console.log("marker update:",this.markerFrequency)
    // マーカーの描画
    if (this.markerFrequency) {
        this.drawMarker(this.markerFrequency,bins);
    }

}

Spectrum.prototype.updateAxes = function() {
    var width = this.ctx_axes.canvas.width;
    var height = this.ctx_axes.canvas.height;

    // Clear axes canvas
    this.ctx_axes.clearRect(0, 0, width, height);

    // Draw axes
    this.ctx_axes.font = "12px sans-serif";
    this.ctx_axes.fillStyle = "white";
    this.ctx_axes.textBaseline = "middle";

    this.ctx_axes.textAlign = "left";
    var step = 10;
    for (var i = this.min_db + 10; i <= this.max_db - 10; i += step) {
        var y = height - this.squeeze(i, 0, height);
        this.ctx_axes.fillText(i, 5, y);

        this.ctx_axes.beginPath();
        this.ctx_axes.moveTo(20, y);
        this.ctx_axes.lineTo(width, y);
        this.ctx_axes.strokeStyle = "rgba(200, 200, 200, 0.10)";
        this.ctx_axes.stroke();
    }

    this.ctx_axes.textBaseline = "bottom";
    for (var i = 0; i < 11; i++) {
        var x = Math.round(width / 10) * i;

        if (this.spanHz > 0) {
            var adjust = 0;
            if (i == 0) {
                this.ctx_axes.textAlign = "left";
                adjust = 3;
            } else if (i == 10) {
                this.ctx_axes.textAlign = "right";
                adjust = -3;
            } else {
                this.ctx_axes.textAlign = "center";
            }

            var freq = this.centerHz + this.spanHz / 10 * (i - 5);
            if (this.centerHz + this.spanHz > 1e6)
                freq = freq / 1e6 + "M";
            else if (this.centerHz + this.spanHz > 1e3)
                freq = freq / 1e3 + "k";
            this.ctx_axes.fillText(freq, x + adjust, height - 3);
        }

        this.ctx_axes.beginPath();
        this.ctx_axes.moveTo(x, 0);
        this.ctx_axes.lineTo(x, height);
        this.ctx_axes.strokeStyle = "rgba(200, 200, 200, 0.10)";
        this.ctx_axes.stroke();
    }
}

Spectrum.prototype.addData = function(data) {
    if (!this.paused) {
        if (data.length != this.wf_size) {
            this.wf_size = data.length;
            this.ctx_wf.canvas.width = data.length;
            this.ctx_wf.fillStyle = "black";
            this.ctx_wf.fillRect(0, 0, this.wf.width, this.wf.height);
            this.imagedata = this.ctx_wf.createImageData(data.length, 1);
        }
        this.drawSpectrum(data);
        this.addWaterfallRow(data);
        this.resize();
        this.bins = data
    }
}

Spectrum.prototype.updateSpectrumRatio = function() {
    this.spectrumHeight = Math.round(this.canvas.height * this.spectrumPercent / 100.0);

    this.gradient = this.ctx.createLinearGradient(0, 0, 0, this.spectrumHeight);
    for (var i = 0; i < this.colormap.length; i++) {
        var c = this.colormap[this.colormap.length - 1 - i];
        this.gradient.addColorStop(i / this.colormap.length,
            "rgba(" + c[0] + "," + c[1] + "," + c[2] + ", 1.0)");
    }
}

Spectrum.prototype.resize = function() {
    var width = this.canvas.clientWidth;
    var height = this.canvas.clientHeight;

    if (this.canvas.width != width ||
        this.canvas.height != height) {
        this.canvas.width = width;
        this.canvas.height = height;
        this.updateSpectrumRatio();
    }

    if (this.axes.width != width ||
        this.axes.height != this.spectrumHeight) {
        this.axes.width = width;
        this.axes.height = this.spectrumHeight;
        this.updateAxes();
    }

}

Spectrum.prototype.setSpectrumPercent = function(percent) {
    if (percent >= 0 && percent <= 100) {
        this.spectrumPercent = percent;
        this.updateSpectrumRatio();
    }
}

Spectrum.prototype.incrementSpectrumPercent = function() {
    if (this.spectrumPercent + this.spectrumPercentStep <= 100) {
        this.setSpectrumPercent(this.spectrumPercent + this.spectrumPercentStep);
    }
}

Spectrum.prototype.decrementSpectrumPercent = function() {
    if (this.spectrumPercent - this.spectrumPercentStep >= 0) {
        this.setSpectrumPercent(this.spectrumPercent - this.spectrumPercentStep);
    }
}

Spectrum.prototype.toggleColor = function() {
    this.colorindex++;
    if (this.colorindex >= colormaps.length)
        this.colorindex = 0;
    this.colormap = colormaps[this.colorindex];
    this.updateSpectrumRatio();
}

Spectrum.prototype.setRange = function(min_db, max_db) {
    this.min_db = min_db;
    this.max_db = max_db;
    this.updateAxes();
}

Spectrum.prototype.rangeUp = function() {
    this.setRange(this.min_db - 5, this.max_db - 5);
}

Spectrum.prototype.rangeDown = function() {
    this.setRange(this.min_db + 5, this.max_db + 5);
}

Spectrum.prototype.rangeIncrease = function() {
    this.setRange(this.min_db - 5, this.max_db + 5);
}

Spectrum.prototype.rangeDecrease = function() {
    if (this.max_db - this.min_db > 10)
        this.setRange(this.min_db + 5, this.max_db - 5);
}

Spectrum.prototype.setCenterHz = function(hz) {
    this.centerHz = hz;
    this.updateAxes();
}

Spectrum.prototype.setSpanHz = function(hz) {
    this.spanHz = hz;
    this.updateAxes();
}

Spectrum.prototype.setAveraging = function(num) {
    if (num >= 0) {
        this.averaging = num;
        this.alpha = 2 / (this.averaging + 1)
    }
}

Spectrum.prototype.incrementAveraging = function() {
    this.setAveraging(this.averaging + 1);
}

Spectrum.prototype.decrementAveraging = function() {
    if (this.averaging > 0) {
        this.setAveraging(this.averaging - 1);
    }
}

Spectrum.prototype.setPaused = function(paused) {
    this.paused = paused;
}

Spectrum.prototype.togglePaused = function() {
    this.setPaused(!this.paused);
}

Spectrum.prototype.setMaxHold = function(maxhold) {
    this.maxHold = maxhold;
    this.binsMax = undefined;
}

Spectrum.prototype.toggleMaxHold = function() {
    this.setMaxHold(!this.maxHold);
}

Spectrum.prototype.toggleFullscreen = function() {
    if (!this.fullscreen) {
        if (this.canvas.requestFullscreen) {
            this.canvas.requestFullscreen();
        } else if (this.canvas.mozRequestFullScreen) {
            this.canvas.mozRequestFullScreen();
        } else if (this.canvas.webkitRequestFullscreen) {
            this.canvas.webkitRequestFullscreen();
        } else if (this.canvas.msRequestFullscreen) {
            this.canvas.msRequestFullscreen();
        }
        this.fullscreen = true;
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen();
        }
        this.fullscreen = false;
    }
}

Spectrum.prototype.onKeypress = function(e) {
    if (e.key == " ") {
        this.togglePaused();
    } else if (e.key == "f") {
        this.toggleFullscreen();
    } else if (e.key == "c") {
        this.toggleColor();
    } else if (e.key == "ArrowUp") {
        this.rangeUp();
    } else if (e.key == "ArrowDown") {
        this.rangeDown();
    } else if (e.key == "ArrowLeft") {
        this.rangeDecrease();
    } else if (e.key == "ArrowRight") {
        this.rangeIncrease();
    } else if (e.key == "s") {
        this.incrementSpectrumPercent();
    } else if (e.key == "w") {
        this.decrementSpectrumPercent();
    } else if (e.key == "+") {
        this.incrementAveraging();
    } else if (e.key == "-") {
        this.decrementAveraging();
    } else if (e.key == "m") {
        this.toggleMaxHold();
    }
}

function Spectrum(id, options) {
    // Handle options
    this.centerHz = (options && options.centerHz) ? options.centerHz : 150000000;
    this.spanHz = (options && options.spanHz) ? options.spanHz : 30000000;
    this.wf_size = (options && options.wf_size) ? options.wf_size : 0;
    this.wf_rows = (options && options.wf_rows) ? options.wf_rows : 4096;
    //this.spectrumPercent = (options && options.spectrumPercent) ? options.spectrumPercent : 25;
    this.spectrumPercent = (options && options.spectrumPercent) ? options.spectrumPercent : 70;
    this.spectrumPercentStep = (options && options.spectrumPercentStep) ? options.spectrumPercentStep : 5;
    this.averaging = (options && options.averaging) ? options.averaging : 0;
    this.maxHold = (options && options.maxHold) ? options.maxHold : false;

    //marker freq def
    this.markerFrequency = 160000000


    // Setup state
    this.paused = false;
    this.fullscreen = false;
    this.min_db = -120;
    this.max_db = -10;
    this.spectrumHeight = 0;

    // Colors
    this.colorindex = 0;
    this.colormap = colormaps[0];

    // Create main canvas and adjust dimensions to match actual
    this.canvas = document.getElementById(id);
    this.canvas.height = this.canvas.clientHeight;
    this.canvas.width = this.canvas.clientWidth;
    this.ctx = this.canvas.getContext("2d");
    this.ctx.fillStyle = "black";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Create offscreen canvas for axes
    this.axes = document.createElement("canvas");
    this.axes.height = 1; // Updated later
    this.axes.width = this.canvas.width;
    this.ctx_axes = this.axes.getContext("2d");

    // Create offscreen canvas for waterfall
    this.wf = document.createElement("canvas");
    this.wf.height = this.wf_rows;
    this.wf.width = this.wf_size;
    this.ctx_wf = this.wf.getContext("2d");

    // Trigger first render
    this.setAveraging(this.averaging);
    this.updateSpectrumRatio();
    this.resize();
    
    //init markdrag
    this.initMarkerDrag();
}

// マーカーを描画する関数を追加
Spectrum.prototype.drawMarker = function(freq,bins) {
    //console.log("marker update:",freq)
    var width = this.ctx.canvas.width;
    var height = this.spectrumHeight;
    
    // 周波数から位置を計算
    var freqPosition = ((freq - (this.centerHz - this.spanHz / 2)) / this.spanHz) * width;

    //console.log("marker update:",freqPosition)
    if (freqPosition >= 0 && freqPosition <= this.wf_size) {
        // マーカーの位置に線を描画
        this.ctx.beginPath();
        this.ctx.moveTo(freqPosition, 0);
        this.ctx.lineTo(freqPosition, height);
        this.ctx.strokeStyle = "white";  // マーカーの色を赤に設定
        this.ctx.stroke();

	 // 最も近い周波数のバンドを探す
        var binIndex = Math.round((freq - (this.centerHz - this.spanHz / 2)) / this.spanHz * bins.length);
        var level = bins[binIndex] || 0;  // bins が空の場合は 0 に

        // マーカーの周波数を MHz 表示に変更し、レベルも表示
        this.ctx.font = "12px sans-serif";
        this.ctx.fillStyle = "white";
        var freqLabel = (freq / 1000000).toFixed(2) + " MHz";  // 周波数を MHz に
        var levelLabel = level.toFixed(2) + " dBm";  // レベル表示
        this.ctx.fillText(freqLabel + " / " + levelLabel, freqPosition + 5, 15);  // 周波数とレベルのラベル
    }
}

// マーカー周波数を設定する関数を追加
Spectrum.prototype.setMarkerFrequency = function(freq) {
    this.markerFrequency = freq;
    this.drawSpectrum(this.bins);
}

// マウスイベントを追加して、マーカーをドラッグ可能に
Spectrum.prototype.initMarkerDrag = function() {
    var isDragging = false;
    var self = this;

    // キャンバスにマウスダウンイベントを追加
    this.ctx.canvas.addEventListener('mousedown', function(event) {
        var width = self.ctx.canvas.width;
        var rect = self.ctx.canvas.getBoundingClientRect();
        var mouseX = event.clientX - rect.left;
        var freqPosition = ((self.markerFrequency - (self.centerHz - self.spanHz / 2)) / self.spanHz) * width;

        // マウスがマーカーの近くにある場合、ドラッグを開始
        if (Math.abs(mouseX - freqPosition) < 10) { // 10px以内でクリックとみなす
            isDragging = true;
        }
    });

    // マウスムーブイベントでドラッグ中にマーカーの周波数を更新
    this.ctx.canvas.addEventListener('mousemove', function(event) {
        if (isDragging) {
            var rect = self.ctx.canvas.getBoundingClientRect();
            var mouseX = event.clientX - rect.left;
            var width = self.ctx.canvas.width;

            // マウス位置から周波数を再計算
            var newFrequency = (mouseX / width) * self.spanHz + (self.centerHz - self.spanHz / 2);
            self.setMarkerFrequency(newFrequency);
        }
    });

    // マウスアップイベントでドラッグを終了
    this.ctx.canvas.addEventListener('mouseup', function() {
        isDragging = false;
    });

    // キャンバス外にマウスが出た場合でもドラッグを終了
    this.ctx.canvas.addEventListener('mouseleave', function() {
        isDragging = false;
    });
};
