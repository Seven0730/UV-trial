#include <iostream>
#include <igl/read_triangle_mesh.h>
#include "xatlas_wrapper.h"

int main(int argc, char* argv[]) {
    if (argc < 2) {
        std::cout << "Usage: " << argv[0] << " <mesh.obj>" << std::endl;
        std::cout << "\n示例：xatlas 自动 UV 生成" << std::endl;
        std::cout << "功能：自动 seam 生成 + LSCM 展开 + 自动 pack" << std::endl;
        std::cout << "支持：WebAssembly" << std::endl;
        return 1;
    }
    
    // 读取网格
    Eigen::MatrixXd V;
    Eigen::MatrixXi F;
    
    if (!igl::read_triangle_mesh(argv[1], V, F)) {
        std::cerr << "无法读取网格文件: " << argv[1] << std::endl;
        return 1;
    }
    
    std::cout << "加载网格: " << V.rows() << " 顶点, " 
              << F.rows() << " 面" << std::endl;
    
    // 配置 xatlas 参数
    UVUnwrapping::XAtlasWrapper wrapper;
    UVUnwrapping::XAtlasWrapper::Options options;
    
    // Chart 生成参数
    options.normal_deviation_weight = 2.0f;
    options.roundness_weight = 0.01f;
    options.straightness_weight = 6.0f;
    options.normal_seam_weight = 4.0f;
    options.texture_seam_weight = 0.5f;
    
    // Pack 参数
    options.resolution = 1024;
    options.padding = 2.0f;
    options.bilinear = true;
    
    std::cout << "\n运行 xatlas..." << std::endl;
    std::cout << "参数配置：" << std::endl;
    std::cout << "  输出分辨率: " << options.resolution << "x" << options.resolution << std::endl;
    std::cout << "  UV 岛间距: " << options.padding << " 像素" << std::endl;
    std::cout << "  法向偏差权重: " << options.normal_deviation_weight << std::endl;
    
    auto [UV, islands] = wrapper.generate(V, F, options);
    
    if (UV.rows() == 0) {
        std::cerr << "xatlas 失败！" << std::endl;
        return 1;
    }
    
    std::cout << "\nxatlas 成功！" << std::endl;
    std::cout << "生成 " << islands.size() << " 个 UV 岛（charts）" << std::endl;
    
    // UV 范围检查
    Eigen::Vector2d min_uv = UV.colwise().minCoeff();
    Eigen::Vector2d max_uv = UV.colwise().maxCoeff();
    
    std::cout << "\nUV 范围：" << std::endl;
    std::cout << "  U: [" << min_uv(0) << ", " << max_uv(0) << "]" << std::endl;
    std::cout << "  V: [" << min_uv(1) << ", " << max_uv(1) << "]" << std::endl;
    
    // 计算 UV 利用率
    double uv_area = 0.0;
    for (int i = 0; i < F.rows(); ++i) {
        Eigen::Vector2d v0 = UV.row(F(i, 0));
        Eigen::Vector2d v1 = UV.row(F(i, 1));
        Eigen::Vector2d v2 = UV.row(F(i, 2));
        
        Eigen::Vector2d e1 = v1 - v0;
        Eigen::Vector2d e2 = v2 - v0;
        
        double area = 0.5 * std::abs(e1.x() * e2.y() - e1.y() * e2.x());
        uv_area += area;
    }
    
    double bbox_area = (max_uv(0) - min_uv(0)) * (max_uv(1) - min_uv(1));
    double utilization = uv_area / bbox_area * 100.0;
    
    std::cout << "\nUV 空间利用率: " << utilization << "%" << std::endl;
    
    std::cout << "\n=== xatlas 特点 ===" << std::endl;
    std::cout << "优点：" << std::endl;
    std::cout << "  ✓ 完全自动化（无需手动切割）" << std::endl;
    std::cout << "  ✓ 智能 seam 放置" << std::endl;
    std::cout << "  ✓ 自动 UV 打包" << std::endl;
    std::cout << "  ✓ 高质量 LSCM 展开" << std::endl;
    std::cout << "  ✓ 支持 WebAssembly（可在浏览器运行）" << std::endl;
    std::cout << "  ✓ 开源，活跃维护" << std::endl;
    
    std::cout << "\n适用场景：" << std::endl;
    std::cout << "  • 需要快速自动 UV 的场景" << std::endl;
    std::cout << "  • 游戏资产批量处理" << std::endl;
    std::cout << "  • 实时/在线 UV 生成" << std::endl;
    std::cout << "  • 不需要精细控制 seam 位置" << std::endl;
    
    std::cout << "\n调优建议：" << std::endl;
    std::cout << "  • normal_deviation_weight ↑ → 更多 charts（更平滑）" << std::endl;
    std::cout << "  • roundness_weight ↑ → 更圆的 charts" << std::endl;
    std::cout << "  • straightness_weight ↑ → 更直的边界" << std::endl;
    std::cout << "  • padding ↑ → 更多间距（防止纹理渗色）" << std::endl;
    
    std::cout << "\n参考：" << std::endl;
    std::cout << "  GitHub: https://github.com/jpcy/xatlas" << std::endl;
    
    return 0;
}
