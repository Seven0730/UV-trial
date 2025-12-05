#include <iostream>
#include <fstream>
#include <vector>
#include <cmath>
#include <igl/read_triangle_mesh.h>
#include "uv_unwrapping.h"
#include "xatlas_wrapper.h"

// 简单的SVG生成器
class SVGWriter {
public:
    SVGWriter(const std::string& filename, int width, int height) 
        : width_(width), height_(height) {
        file_.open(filename);
        file_ << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
        file_ << "<svg xmlns=\"http://www.w3.org/2000/svg\" ";
        file_ << "width=\"" << width << "\" height=\"" << height << "\" ";
        file_ << "viewBox=\"0 0 " << width << " " << height << "\">\n";
        
        // 白色背景
        file_ << "<rect width=\"" << width << "\" height=\"" << height << "\" fill=\"white\"/>\n";
        
        // 网格
        file_ << "<defs><pattern id=\"grid\" width=\"50\" height=\"50\" ";
        file_ << "patternUnits=\"userSpaceOnUse\">\n";
        file_ << "<path d=\"M 50 0 L 0 0 0 50\" fill=\"none\" stroke=\"#e0e0e0\" stroke-width=\"1\"/>\n";
        file_ << "</pattern></defs>\n";
        file_ << "<rect width=\"" << width << "\" height=\"" << height << "\" fill=\"url(#grid)\"/>\n";
    }
    
    ~SVGWriter() {
        if (file_.is_open()) {
            file_ << "</svg>\n";
            file_.close();
        }
    }
    
    void drawTriangle(const Eigen::Vector2d& p0, const Eigen::Vector2d& p1, 
                     const Eigen::Vector2d& p2, const std::string& color = "#3498db") {
        // 将UV坐标[0,1]映射到SVG坐标
        auto to_svg_x = [this](double x) { return x * width_; };
        auto to_svg_y = [this](double y) { return (1.0 - y) * height_; }; // 翻转Y轴
        
        file_ << "<polygon points=\"";
        file_ << to_svg_x(p0.x()) << "," << to_svg_y(p0.y()) << " ";
        file_ << to_svg_x(p1.x()) << "," << to_svg_y(p1.y()) << " ";
        file_ << to_svg_x(p2.x()) << "," << to_svg_y(p2.y()) << "\" ";
        file_ << "fill=\"" << color << "\" fill-opacity=\"0.3\" ";
        file_ << "stroke=\"#2c3e50\" stroke-width=\"1.5\"/>\n";
    }
    
    void drawText(double x, double y, const std::string& text, int size = 20) {
        file_ << "<text x=\"" << x << "\" y=\"" << y << "\" ";
        file_ << "font-family=\"Arial, sans-serif\" font-size=\"" << size << "\" ";
        file_ << "fill=\"#2c3e50\">" << text << "</text>\n";
    }
    
    void drawBorder() {
        file_ << "<rect x=\"2\" y=\"2\" width=\"" << (width_-4) << "\" height=\"" << (height_-4) << "\" ";
        file_ << "fill=\"none\" stroke=\"#95a5a6\" stroke-width=\"3\"/>\n";
    }

private:
    std::ofstream file_;
    int width_;
    int height_;
};

void generate_uv_image(
    const Eigen::MatrixXd& UV,
    const Eigen::MatrixXi& F,
    const std::string& filename,
    const std::string& title
) {
    const int img_size = 800;
    SVGWriter svg(filename, img_size, img_size);
    
    // 归一化UV到[0,1]
    Eigen::Vector2d min_uv = UV.colwise().minCoeff();
    Eigen::Vector2d max_uv = UV.colwise().maxCoeff();
    Eigen::Vector2d range = max_uv - min_uv;
    
    double scale = std::min(1.0 / range.x(), 1.0 / range.y()) * 0.9;
    Eigen::Vector2d offset = (Eigen::Vector2d(1, 1) - range * scale) * 0.5;
    
    // 绘制所有三角形
    std::vector<std::string> colors = {
        "#3498db", "#e74c3c", "#2ecc71", "#f39c12", "#9b59b6", 
        "#1abc9c", "#34495e", "#e67e22", "#95a5a6", "#16a085"
    };
    
    for (int i = 0; i < F.rows(); ++i) {
        Eigen::Vector2d p0 = (UV.row(F(i, 0)).transpose() - min_uv) * scale + offset;
        Eigen::Vector2d p1 = (UV.row(F(i, 1)).transpose() - min_uv) * scale + offset;
        Eigen::Vector2d p2 = (UV.row(F(i, 2)).transpose() - min_uv) * scale + offset;
        
        std::string color = colors[i % colors.size()];
        svg.drawTriangle(p0, p1, p2, color);
    }
    
    // 添加标题
    svg.drawText(20, 40, title, 28);
    svg.drawBorder();
    
    std::cout << "  ✓ 保存: " << filename << std::endl;
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "用法: " << argv[0] << " <mesh.obj> [output_prefix]" << std::endl;
        std::cout << "\n功能: 生成UV展开效果图（SVG格式）" << std::endl;
        std::cout << "输出: <prefix>_lscm.svg, <prefix>_abf.svg, <prefix>_xatlas.svg" << std::endl;
        return 1;
    }
    
    std::string mesh_file = argv[1];
    std::string prefix = (argc >= 3) ? argv[2] : "uv_result";
    
    // 读取网格
    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    if (!igl::read_triangle_mesh(mesh_file, V, F)) {
        std::cerr << "无法读取网格: " << mesh_file << std::endl;
        return 1;
    }
    
    std::cout << "========================================" << std::endl;
    std::cout << "  UV 展开效果图生成器" << std::endl;
    std::cout << "========================================" << std::endl;
    std::cout << "\n加载网格: " << V.rows() << " 顶点, " << F.rows() << " 面" << std::endl;
    std::cout << "输出前缀: " << prefix << std::endl;
    
    // 1. LSCM
    std::cout << "\n[1/3] 运行 LSCM..." << std::endl;
    auto lscm_result = UVUnwrapping::unwrapLSCM(V, F);
    if (lscm_result.UV.rows() > 0) {
        std::cout << "  成功 - 失真: " << lscm_result.distortion << std::endl;
        generate_uv_image(lscm_result.UV, F, prefix + "_lscm.svg", 
                         "LSCM UV Unwrapping");
    } else {
        std::cout << "  失败（网格可能需要边界）" << std::endl;
    }
    
    // 2. ABF
    std::cout << "\n[2/3] 运行 ABF..." << std::endl;
    auto abf_result = UVUnwrapping::unwrapABF(V, F, 50, 1e-4);
    if (abf_result.UV.rows() > 0) {
        std::cout << "  成功 - 失真: " << abf_result.distortion << std::endl;
        generate_uv_image(abf_result.UV, F, prefix + "_abf.svg", 
                         "ABF UV Unwrapping");
    } else {
        std::cout << "  失败" << std::endl;
    }
    
    // 3. xatlas
    std::cout << "\n[3/3] 运行 xatlas..." << std::endl;
    UVUnwrapping::XAtlasWrapper wrapper;
    UVUnwrapping::XAtlasWrapper::Options options;
    options.resolution = 1024;
    options.padding = 2.0f;
    
    auto [xatlas_uv, xatlas_islands] = wrapper.generate(V, F, options);
    if (xatlas_uv.rows() > 0) {
        double xatlas_distortion = UVUnwrapping::computeUVDistortion(V, F, xatlas_uv);
        std::cout << "  成功 - 失真: " << xatlas_distortion 
                  << ", UV岛: " << xatlas_islands.size() << std::endl;
        generate_uv_image(xatlas_uv, F, prefix + "_xatlas.svg", 
                         "xatlas Auto UV Unwrapping");
    } else {
        std::cout << "  失败" << std::endl;
    }
    
    // 对比总结
    std::cout << "\n========================================" << std::endl;
    std::cout << "  生成完成" << std::endl;
    std::cout << "========================================" << std::endl;
    
    if (lscm_result.UV.rows() > 0 && abf_result.UV.rows() > 0) {
        double improvement = (lscm_result.distortion - abf_result.distortion) / 
                            lscm_result.distortion * 100.0;
        std::cout << "\n质量对比:" << std::endl;
        std::cout << "  LSCM 失真: " << lscm_result.distortion << std::endl;
        std::cout << "  ABF 失真:  " << abf_result.distortion;
        if (improvement > 0) {
            std::cout << " (改善 " << improvement << "%)" << std::endl;
        } else {
            std::cout << std::endl;
        }
    }
    
    std::cout << "\n生成的文件:" << std::endl;
    if (lscm_result.UV.rows() > 0) 
        std::cout << "  - " << prefix << "_lscm.svg" << std::endl;
    if (abf_result.UV.rows() > 0) 
        std::cout << "  - " << prefix << "_abf.svg" << std::endl;
    if (xatlas_uv.rows() > 0) 
        std::cout << "  - " << prefix << "_xatlas.svg" << std::endl;
    
    std::cout << "\n提示: 使用浏览器打开 .svg 文件查看效果" << std::endl;
    std::cout << "========================================" << std::endl;
    
    return 0;
}
