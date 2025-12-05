#include <iostream>
#include <fstream>
#include <vector>
#include <set>
#include <cmath>
#include <igl/read_triangle_mesh.h>
#include <igl/edges.h>
#include <igl/boundary_loop.h>
#include "uv_segmentation.h"

// SVG生成器 - 显示3D网格和缝合线
class SeamVisualizer {
public:
    SeamVisualizer(const std::string& filename, int width, int height) 
        : width_(width), height_(height) {
        file_.open(filename);
        file_ << "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
        file_ << "<svg xmlns=\"http://www.w3.org/2000/svg\" ";
        file_ << "width=\"" << width << "\" height=\"" << height << "\" ";
        file_ << "viewBox=\"0 0 " << width << " " << height << "\">\n";
        file_ << "<rect width=\"" << width << "\" height=\"" << height << "\" fill=\"#f8f9fa\"/>\n";
    }
    
    ~SeamVisualizer() {
        if (file_.is_open()) {
            file_ << "</svg>\n";
            file_.close();
        }
    }
    
    void drawMesh(const Eigen::MatrixXd& V, const Eigen::MatrixXi& F,
                  const Eigen::MatrixXd& V2D) {
        // 绘制所有面（浅灰色）
        for (int i = 0; i < F.rows(); i++) {
            Eigen::Vector2d p0 = V2D.row(F(i, 0));
            Eigen::Vector2d p1 = V2D.row(F(i, 1));
            Eigen::Vector2d p2 = V2D.row(F(i, 2));
            
            file_ << "<polygon points=\"";
            file_ << p0.x() << "," << p0.y() << " ";
            file_ << p1.x() << "," << p1.y() << " ";
            file_ << p2.x() << "," << p2.y() << "\" ";
            file_ << "fill=\"#e9ecef\" fill-opacity=\"0.6\" ";
            file_ << "stroke=\"#adb5bd\" stroke-width=\"0.5\"/>\n";
        }
    }
    
    void drawSeams(const Eigen::MatrixXd& V2D, 
                   const std::vector<std::pair<int, int>>& seams,
                   const std::string& color = "#dc3545") {
        for (const auto& edge : seams) {
            Eigen::Vector2d p0 = V2D.row(edge.first);
            Eigen::Vector2d p1 = V2D.row(edge.second);
            
            file_ << "<line x1=\"" << p0.x() << "\" y1=\"" << p0.y() << "\" ";
            file_ << "x2=\"" << p1.x() << "\" y2=\"" << p1.y() << "\" ";
            file_ << "stroke=\"" << color << "\" stroke-width=\"3\" ";
            file_ << "stroke-linecap=\"round\"/>\n";
        }
    }
    
    void drawIslandBoundaries(const Eigen::MatrixXd& V2D,
                             const std::vector<UVSegmentation::UVIsland>& islands) {
        std::vector<std::string> colors = {
            "#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6",
            "#1abc9c", "#e67e22", "#95a5a6", "#34495e", "#16a085"
        };
        
        for (size_t i = 0; i < islands.size(); i++) {
            const auto& island = islands[i];
            std::string color = colors[i % colors.size()];
            
            // 绘制岛屿边界
            for (const auto& edge : island.boundary) {
                int v0 = edge.v0;
                int v1 = edge.v1;
                
                Eigen::Vector2d p0 = V2D.row(v0);
                Eigen::Vector2d p1 = V2D.row(v1);
                
                file_ << "<line x1=\"" << p0.x() << "\" y1=\"" << p0.y() << "\" ";
                file_ << "x2=\"" << p1.x() << "\" y2=\"" << p1.y() << "\" ";
                file_ << "stroke=\"" << color << "\" stroke-width=\"2.5\" ";
                file_ << "stroke-linecap=\"round\"/>\n";
            }
        }
    }
    
    void drawTitle(const std::string& text) {
        file_ << "<text x=\"" << width_/2 << "\" y=\"30\" ";
        file_ << "font-family=\"Arial\" font-size=\"20\" font-weight=\"bold\" ";
        file_ << "fill=\"#2c3e50\" text-anchor=\"middle\">" << text << "</text>\n";
    }
    
    void drawLegend(const std::vector<std::string>& items, 
                   const std::vector<std::string>& colors) {
        int y = 60;
        for (size_t i = 0; i < items.size(); i++) {
            file_ << "<line x1=\"20\" y1=\"" << y << "\" x2=\"50\" y2=\"" << y << "\" ";
            file_ << "stroke=\"" << colors[i] << "\" stroke-width=\"3\"/>\n";
            file_ << "<text x=\"60\" y=\"" << (y+5) << "\" ";
            file_ << "font-family=\"Arial\" font-size=\"14\" fill=\"#2c3e50\">";
            file_ << items[i] << "</text>\n";
            y += 25;
        }
    }

private:
    std::ofstream file_;
    int width_, height_;
};

// 将3D坐标投影到2D
Eigen::MatrixXd project_to_2d(const Eigen::MatrixXd& V) {
    Eigen::MatrixXd V2D(V.rows(), 2);
    
    // 计算边界框
    Eigen::Vector3d min_pt = V.colwise().minCoeff();
    Eigen::Vector3d max_pt = V.colwise().maxCoeff();
    Eigen::Vector3d range = max_pt - min_pt;
    double max_range = range.maxCoeff();
    
    // 简单正交投影 (去掉Z坐标)
    for (int i = 0; i < V.rows(); i++) {
        V2D(i, 0) = (V(i, 0) - min_pt.x()) / max_range * 700 + 50;
        V2D(i, 1) = 750 - ((V(i, 1) - min_pt.y()) / max_range * 700 + 50); // 翻转Y
    }
    
    return V2D;
}

// 从UV岛提取缝合线
std::vector<std::pair<int, int>> extract_seams_from_islands(
    const Eigen::MatrixXi& F,
    const std::vector<UVSegmentation::UVIsland>& islands) {
    
    std::set<std::pair<int, int>> all_edges;
    std::set<std::pair<int, int>> seam_edges;
    
    // 收集所有边
    for (int i = 0; i < F.rows(); i++) {
        for (int j = 0; j < 3; j++) {
            int v0 = F(i, j);
            int v1 = F(i, (j+1)%3);
            if (v0 > v1) std::swap(v0, v1);
            all_edges.insert({v0, v1});
        }
    }
    
    // 收集岛屿内部边
    std::set<std::pair<int, int>> island_internal_edges;
    for (const auto& island : islands) {
        for (int face_idx : island.faces) {
            for (int j = 0; j < 3; j++) {
                int v0 = F(face_idx, j);
                int v1 = F(face_idx, (j+1)%3);
                if (v0 > v1) std::swap(v0, v1);
                island_internal_edges.insert({v0, v1});
            }
        }
    }
    
    // 缝合线 = 所有边 - 岛屿内部边
    std::vector<std::pair<int, int>> seams;
    for (const auto& edge : all_edges) {
        if (island_internal_edges.find(edge) == island_internal_edges.end()) {
            seams.push_back(edge);
        }
    }
    
    return seams;
}

void test_segmentation_method(const std::string& name,
                              const Eigen::MatrixXd& V,
                              const Eigen::MatrixXi& F,
                              const std::vector<UVSegmentation::UVIsland>& islands,
                              const std::string& output_file) {
    Eigen::MatrixXd V2D = project_to_2d(V);
    
    SeamVisualizer svg(output_file, 800, 800);
    svg.drawTitle(name + " - Seam Lines (" + std::to_string(islands.size()) + " islands)");
    
    // 绘制网格
    svg.drawMesh(V, F, V2D);
    
    // 绘制UV岛边界（不同颜色）
    svg.drawIslandBoundaries(V2D, islands);
    
    // 添加图例
    std::vector<std::string> legend_items = {
        "UV Islands: " + std::to_string(islands.size()),
        "Total Faces: " + std::to_string(F.rows())
    };
    std::vector<std::string> legend_colors = {"#e74c3c", "#2c3e50"};
    svg.drawLegend(legend_items, legend_colors);
    
    std::cout << "✓ " << name << ": " << islands.size() << " UV岛\n";
    std::cout << "  保存到: " << output_file << "\n";
}

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "用法: " << argv[0] << " <mesh.obj> [output_prefix]\n";
        std::cout << "\n功能: 可视化不同分割算法的缝合线\n";
        std::cout << "输出: 每个算法生成一个SVG文件显示缝合线位置\n";
        return 1;
    }

    std::string mesh_file = argv[1];
    std::string output_prefix = argc > 2 ? argv[2] : "seams";

    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    std::cout << "========================================\n";
    std::cout << "  缝合线可视化工具\n";
    std::cout << "========================================\n\n";
    std::cout << "加载网格: " << mesh_file << "\n";
    
    if (!igl::read_triangle_mesh(mesh_file, V, F)) {
        std::cerr << "无法读取网格\n";
        return 1;
    }
    
    std::cout << "网格: " << V.rows() << " 顶点, " << F.rows() << " 面\n\n";
    
    using namespace UVSegmentation;
    
    // 测试不同的分割算法
    std::cout << "测试分割算法:\n";
    std::cout << "----------------------------------------\n";
    
    // 1. 边缘环分割
    try {
        auto edge_loops = detectEdgeLoops(V, F, 30.0);
        auto islands = segmentByEdgeLoops(V, F, edge_loops);
        test_segmentation_method("Edge Loop", V, F, islands,
                                output_prefix + "_edgeloop.svg");
    } catch (const std::exception& e) {
        std::cout << "✗ Edge Loop failed: " << e.what() << "\n";
    }
    
    // 2. 高曲率分割
    try {
        auto islands = segmentByHighCurvature(V, F, 0.5);
        test_segmentation_method("High Curvature", V, F, islands,
                                output_prefix + "_curvature.svg");
    } catch (const std::exception& e) {
        std::cout << "✗ High Curvature failed: " << e.what() << "\n";
    }
    
    // 3. 高斯曲率分割
    try {
        auto islands = segmentByGaussianCurvature(V, F, 0.01);
        test_segmentation_method("Gaussian Curvature", V, F, islands,
                                output_prefix + "_gaussian.svg");
    } catch (const std::exception& e) {
        std::cout << "✗ Gaussian Curvature failed: " << e.what() << "\n";
    }
    
    // 4. 对称分割（假设YZ平面对称）
    try {
        Eigen::Vector4d plane(1, 0, 0, 0); // x = 0平面
        auto islands = segmentBySymmetry(V, F, plane, 0.01);
        test_segmentation_method("Symmetry (YZ plane)", V, F, islands,
                                output_prefix + "_symmetry.svg");
    } catch (const std::exception& e) {
        std::cout << "✗ Symmetry failed: " << e.what() << "\n";
    }
    
    std::cout << "\n========================================\n";
    std::cout << "完成！查看生成的SVG文件了解缝合线位置\n";
    std::cout << "========================================\n";
    
    return 0;
}
