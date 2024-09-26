package main

import (
	"fmt"
	"log"
	"math"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"time"
	//"encoding/json"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

const FFT_SIZE = 4096

type Spectrum struct{
	Data []int32 `json:"s"`
}

// WebSocket用のアップグレーダー
var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}


func ownFreq(fo int) bool {
	if fo > FFT_SIZE/2 -96 && fo < FFT_SIZE/2 + 96 {
		return true
	} else {
		return false
	}

}

// 模擬的なFFTデータを生成する
func generateMockFFT(sp *Spectrum) {
	var offset int32= -80
	for i := 0; i < FFT_SIZE; i++ {
		// ここではランダムな値を使って模擬データを生成
		if ownFreq(i) {
			offset = -20
		} else {
			offset = -110
		}
		sp.Data[i] = offset+int32(3*math.Sin(float64(i)/float64(FFT_SIZE)*2*math.Pi) + 1*rand.Float64())
		//sp.Data[i] = float32(20*math.Sin(float64(i)/float64(FFT_SIZE)*2*math.Pi) + 10*rand.Float64())
		//sp.Data[i] = float32(255 + rand.Float64() + math.Sin(2*math.Pi))
	}
	return
}



// FFTデータをJSON形式でWebSocketクライアントに送信
func sendFFTData(conn *websocket.Conn) {
	var sp Spectrum
	sp.Data = make([]int32, FFT_SIZE)
	for {
		generateMockFFT(&sp) // 4096ポイントの模擬FFTデータを生成
		//bytes, _ := json.Marshal(sp)	
		//log.Println("sending data:", string(bytes))
		err := conn.WriteJSON(sp)        // JSON形式で送信
		if err != nil {
			log.Println("Error sending data:", err)
			break
		}
		//time.Sleep(1000 * time.Millisecond) // 100msごとにデータ送信
		time.Sleep(100 * time.Millisecond) // 100msごとにデータ送信
	}
}

// WebSocketリクエストをハンドル
func handleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("Error upgrading to WebSocket:", err)
		return
	}
	defer conn.Close()

	log.Println("Client connected")
	sendFFTData(conn)
}

// 実行ディレクトリにあるファイルを返す
func serveFile(c *gin.Context) {
	filePath := c.Param("filepath")
	// 実行ディレクトリの相対パスを解決
	absPath, err := filepath.Abs(filePath)
	if err != nil {
		c.String(http.StatusInternalServerError, "Invalid file path")
		return
	}

	// ファイルの存在を確認
	if _, err := os.Stat(absPath); os.IsNotExist(err) {
		c.String(http.StatusNotFound, "File not found")
		return
	}

	// ファイルを返す
	c.File(absPath)
}

func main() {
	r := gin.Default()

	// 静的ファイルのルート
	r.Static("/static", "./static")

	// GETリクエストでindex.htmlを返す
	r.GET("/", func(c *gin.Context) {
		c.File("./index.html") // 実行ディレクトリのindex.htmlを返す
	})

	// WebSocketのハンドリング
	r.GET("/websocket", handleWebSocket)

	// URIの指定されたファイルパスに応じたファイルを返す
	r.GET("/file/*filepath", serveFile)

	// サーバーを起動
	port := 8080
	log.Printf("Starting server on :%d...\n", port)
	if err := r.Run(fmt.Sprintf(":%d", port)); err != nil {
		log.Fatal("Server error:", err)
	}
}
